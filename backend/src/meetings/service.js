import { pool } from '../db/pool.js';
import { createMeetingDetailed, zoomConfigurationStatus } from '../zoom/zoom.js';
import { notificationConfiguration, sendBookingDetails } from '../notifications/notifier.js';

const IST_ZONE = 'Asia/Kolkata';

const sessionSql = `
  SELECT cs.id, cs.booking_id, cs.status AS session_status, cs.meeting_url,
         cs.meeting_creation_status, cs.started_at, cs.ended_at,
         b.status AS booking_status, b.starts_at, b.ends_at, b.amount,
         s.id AS student_id, s.name AS student_name, s.email AS student_email, s.phone AS student_phone,
         t.id AS teacher_id, t.name AS teacher_name, t.email AS teacher_email, t.phone AS teacher_phone
  FROM class_sessions cs
  JOIN bookings b ON b.id = cs.booking_id
  JOIN users s ON s.id = b.student_id
  JOIN users t ON t.id = b.teacher_id
`;

async function loadSession(sessionId) {
  const { rows } = await pool.query(`${sessionSql} WHERE cs.id = $1`, [sessionId]);
  return rows[0] ?? null;
}

function durationMinutes(row) {
  return Math.max(15, Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60000));
}

function displayDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: IST_ZONE,
  }).format(new Date(value));
}

function displayTime(value) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST_ZONE,
  }).format(new Date(value));
}

export function meetingContext(row) {
  return {
    kind: 'join_details',
    bookingId: row.booking_id,
    studentName: row.student_name,
    teacherName: row.teacher_name,
    date: displayDate(row.starts_at),
    startTime: displayTime(row.starts_at),
    endTime: displayTime(row.ends_at),
    amount: Number(row.amount),
    meetingUrl: row.meeting_url,
  };
}

export async function ensureSessionMeeting(sessionId) {
  const row = await loadSession(sessionId);
  if (!row) return { status: 'not_found', error: 'Class session not found.', session: null };
  if (row.meeting_url) return { status: 'existing', session: row };
  if (!['scheduled', 'ongoing'].includes(row.session_status)) {
    return { status: 'unavailable', error: 'This class is no longer scheduled.', session: row };
  }
  if (['cancelled', 'rejected'].includes(row.booking_status)) {
    return { status: 'unavailable', error: 'This booking is not active.', session: row };
  }
  if (row.meeting_creation_status === 'creating') {
    return { status: 'creating', error: 'A meeting link is already being created.', session: row };
  }

  const zoom = zoomConfigurationStatus();
  if (!zoom.configured) {
    return {
      status: 'not_configured',
      error: 'Zoom is not configured.',
      missingKeys: zoom.missingKeys,
      session: row,
    };
  }

  const claim = await pool.query(
    `UPDATE class_sessions SET meeting_creation_status = 'creating'
     WHERE id = $1 AND meeting_url IS NULL
       AND meeting_creation_status IN ('not_created', 'failed', 'unknown')
     RETURNING id`,
    [sessionId],
  );
  if (!claim.rowCount) {
    const current = await loadSession(sessionId);
    return {
      status: current?.meeting_url ? 'existing' : current?.meeting_creation_status === 'creating' ? 'creating' : 'busy',
      error: current?.meeting_url ? null : 'A meeting link could not be created right now.',
      session: current,
    };
  }

  const result = await createMeetingDetailed({
    topic: `EDTECH session: ${row.student_name} with ${row.teacher_name}`,
    startsAt: row.starts_at,
    durationMinutes: durationMinutes(row),
  });

  if (!result.ok) {
    await pool.query(
      `UPDATE class_sessions SET meeting_creation_status = 'failed' WHERE id = $1 AND meeting_url IS NULL`,
      [sessionId],
    );
    return {
      status: result.status === 'not_configured' ? 'not_configured' : 'failed',
      error: result.error,
      missingKeys: result.missingKeys ?? [],
      session: await loadSession(sessionId),
    };
  }

  await pool.query(
    `UPDATE class_sessions SET meeting_url = $2, meeting_creation_status = 'created' WHERE id = $1`,
    [sessionId, result.joinUrl],
  );
  return {
    status: 'created',
    joinUrl: result.joinUrl,
    meetingId: result.meetingId ?? null,
    session: await loadSession(sessionId),
  };
}

export async function sendSessionJoinDetails(sessionId) {
  const configuration = notificationConfiguration();
  if (!configuration.email.configured && !configuration.whatsapp.configured) {
    return {
      status: 'not_configured',
      error: 'Email and WhatsApp are not configured.',
      configuration,
      session: await loadSession(sessionId),
    };
  }

  let row = await loadSession(sessionId);
  if (!row) return { status: 'not_found', error: 'Class session not found.', session: null };

  let meeting = null;
  if (!row.meeting_url) {
    meeting = await ensureSessionMeeting(sessionId);
    row = meeting.session ?? await loadSession(sessionId);
    if (!row?.meeting_url) {
      return {
        status: 'meeting_missing',
        error: meeting.error ?? 'The meeting link is not ready yet.',
        missingKeys: meeting.missingKeys ?? [],
        meetingStatus: meeting.status,
        configuration,
        session: row,
      };
    }
  }

  const recipients = [
    {
      id: row.student_id, name: row.student_name, email: row.student_email,
      phone: row.student_phone, role: 'student',
    },
    {
      id: row.teacher_id, name: row.teacher_name, email: row.teacher_email,
      phone: row.teacher_phone, role: 'teacher',
    },
  ];
  const delivery = await sendBookingDetails(pool, recipients, meetingContext(row));
  return { status: 'sent', configuration, session: row, delivery };
}

function summarizeNotifications(rows) {
  const summary = {
    email: { lastStatus: null, sent: 0, failed: 0, queued: 0, unknown: 0 },
    whatsapp: { lastStatus: null, sent: 0, failed: 0, queued: 0, unknown: 0 },
  };
  for (const row of rows) {
    const channel = row.channel === 'whatsapp' ? 'whatsapp' : row.channel === 'email' ? 'email' : null;
    if (!channel) continue;
    if (!summary[channel].lastStatus) summary[channel].lastStatus = row.status;
    if (Object.hasOwn(summary[channel], row.status)) summary[channel][row.status] += 1;
  }
  return summary;
}

export async function loadMeetingChecks() {
  const [{ rows }, { rows: unlinked }] = await Promise.all([
    pool.query(
      `${sessionSql}
       WHERE b.status IN ('paid', 'completed')
         AND b.starts_at >= now() - interval '2 days'
         AND b.starts_at <= now() + interval '90 days'
       ORDER BY b.starts_at ASC
       LIMIT 100`,
    ),
    pool.query(
      `SELECT b.id, b.status, b.starts_at, b.ends_at, b.amount,
              s.id AS student_id, s.name AS student_name,
              t.id AS teacher_id, t.name AS teacher_name
       FROM bookings b
       JOIN users s ON s.id = b.student_id
       JOIN users t ON t.id = b.teacher_id
       LEFT JOIN class_sessions cs ON cs.booking_id = b.id
       WHERE b.status IN ('paid', 'completed') AND b.starts_at >= now() - interval '2 days' AND cs.id IS NULL
       ORDER BY b.starts_at ASC
       LIMIT 50`,
    ),
  ]);

  const bookingIds = [...new Set(rows.map((row) => row.booking_id))];
  const notifications = bookingIds.length
    ? (await pool.query(
      `SELECT booking_id, channel, status, created_at
       FROM notifications
       WHERE booking_id = ANY($1::uuid[]) AND kind = 'join_details'
       ORDER BY created_at DESC`,
      [bookingIds],
    )).rows
    : [];

  const byBooking = new Map();
  for (const notification of notifications) {
    const list = byBooking.get(notification.booking_id) ?? [];
    list.push(notification);
    byBooking.set(notification.booking_id, list);
  }

  const zoom = zoomConfigurationStatus();
  const messaging = notificationConfiguration();

  return {
    generatedAt: new Date().toISOString(),
    configuration: {
      zoom,
      email: messaging.email,
      whatsapp: messaging.whatsapp,
    },
    sessions: rows.map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      status: row.session_status,
      bookingStatus: row.booking_status,
      meetingUrl: row.meeting_url,
      meetingCreationStatus: row.meeting_creation_status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      durationMinutes: durationMinutes(row),
      amount: Number(row.amount),
      student: {
        id: row.student_id, name: row.student_name, email: row.student_email, phone: row.student_phone,
      },
      teacher: {
        id: row.teacher_id, name: row.teacher_name, email: row.teacher_email, phone: row.teacher_phone,
      },
      notifications: summarizeNotifications(byBooking.get(row.booking_id) ?? []),
    })),
    unlinkedPaidBookings: unlinked.map((row) => ({
      ...row,
      amount: Number(row.amount),
      student: { id: row.student_id, name: row.student_name },
      teacher: { id: row.teacher_id, name: row.teacher_name },
    })),
  };
}
