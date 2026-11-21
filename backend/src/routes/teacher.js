import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuthenticatedUser } from '../security/authMiddleware.js';
import { writeAudit } from '../security/audit.js';
import { ensureSessionMeeting } from '../meetings/service.js';
import { sendBookingDetails } from '../notifications/notifier.js';

export const teacherRouter = Router();

const IST_ZONE = 'Asia/Kolkata';
const BOOKING_STATUSES = new Set(['pending', 'approved', 'rejected', 'paid', 'completed', 'cancelled']);
const SESSION_STATUSES = new Set(['scheduled', 'ongoing', 'completed', 'cancelled']);

function requireTeacher(req, res, next) {
  if (req.auth.account_role !== 'teacher') {
    return res.status(403).json({ error: 'This area is available to teacher accounts only.' });
  }
  return next();
}

function validationError(res, result) {
  return res.status(400).json({ error: 'Some details are missing or invalid.', details: result.error.issues });
}

const isoTimestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Expected an ISO date-time.');

const listQuerySchema = z.object({
  status: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  from: isoTimestamp.optional(),
  to: isoTimestamp.optional(),
});

const idSchema = z.string().uuid();

function parseStatusFilter(value, allowed) {
  if (!value) return null;
  const statuses = value.split(',').map((status) => status.trim()).filter(Boolean);
  if (!statuses.length || statuses.some((status) => !allowed.has(status))) return undefined;
  return [...new Set(statuses)];
}

function bookingRowSql() {
  return `b.id, b.student_id, b.teacher_id, b.status, b.amount, b.created_at,
    b.starts_at, b.ends_at,
    s.name AS student_name, s.email AS student_email,
    to_char(b.starts_at AT TIME ZONE '${IST_ZONE}', 'YYYY-MM-DD') AS date,
    to_char(b.starts_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS start_time,
    to_char(b.ends_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS end_time`;
}

function bookingPayload(row) {
  return {
    id: row.id,
    student_id: row.student_id,
    teacher_id: row.teacher_id,
    student_name: row.student_name,
    student_email: row.student_email,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    amount: Number(row.amount),
    created_at: row.created_at,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    student: { id: row.student_id, name: row.student_name },
  };
}

function sessionRowSql() {
  return `cs.id, cs.booking_id, cs.meeting_provider, cs.meeting_url, cs.meeting_creation_status,
    cs.status, cs.started_at, cs.ended_at, cs.recording_url, cs.recording_consent, cs.created_at,
    b.teacher_id, b.student_id, b.starts_at, b.ends_at, b.amount, b.status AS booking_status,
    s.name AS student_name, s.email AS student_email`;
}

function sessionPayload(row) {
  return {
    id: row.id,
    booking_id: row.booking_id,
    meeting_provider: row.meeting_provider,
    meeting_url: row.meeting_url,
    meeting_creation_status: row.meeting_creation_status,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    recording_url: row.recording_url,
    recording_consent: row.recording_consent,
    created_at: row.created_at,
    teacher_id: row.teacher_id,
    student_id: row.student_id,
    student_name: row.student_name,
    student_email: row.student_email,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    amount: Number(row.amount),
    booking_status: row.booking_status,
  };
}

async function loadProfile(teacherId) {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.email, u.phone, tp.subjects, tp.bio, tp.hourly_rate, tp.approved
     FROM users u JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE u.id = $1`,
    [teacherId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subjects: row.subjects ?? [],
    bio: row.bio,
    hourly_rate: row.hourly_rate === null ? null : Number(row.hourly_rate),
    approved: row.approved,
  };
}

async function loadSession(teacherId, sessionId) {
  const { rows } = await pool.query(
    `SELECT ${sessionRowSql()}
     FROM class_sessions cs
     JOIN bookings b ON b.id = cs.booking_id
     JOIN users s ON s.id = b.student_id
     WHERE cs.id = $1 AND b.teacher_id = $2`,
    [sessionId, teacherId],
  );
  return rows[0] ?? null;
}

async function listBookings(teacherId, query) {
  const clauses = ['b.teacher_id = $1'];
  const params = [teacherId];
  if (query.statuses) {
    params.push(query.statuses);
    clauses.push(`b.status = ANY($${params.length})`);
  }
  if (query.from) {
    params.push(query.from);
    clauses.push(`b.starts_at >= $${params.length}`);
  }
  if (query.to) {
    params.push(query.to);
    clauses.push(`b.starts_at < $${params.length}`);
  }
  let limitClause = '';
  if (query.limit) {
    params.push(query.limit);
    limitClause = `LIMIT $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ${bookingRowSql()}
     FROM bookings b JOIN users s ON s.id = b.student_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY b.starts_at DESC
     ${limitClause}`,
    params,
  );
  return rows.map(bookingPayload);
}

teacherRouter.get('/profile', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const profile = await loadProfile(req.auth.id);
    if (!profile) return res.status(404).json({ error: 'Teacher profile not found.' });
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
});

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  bio: z.string().trim().max(600).nullable().optional(),
  subjects: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  hourlyRate: z.number().min(0).max(100000).nullable().optional(),
});

teacherRouter.patch('/profile', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  const parsed = profileUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed);
  if (!Object.keys(parsed.data).length) {
    return res.status(400).json({ error: 'Provide at least one profile field to update.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, phone, bio, subjects, hourlyRate } = parsed.data;
    if (name !== undefined || phone !== undefined) {
      const result = await client.query(
        `UPDATE users
         SET name = COALESCE($2, name),
             phone = CASE WHEN $4 THEN $3 ELSE phone END,
             updated_at = now()
         WHERE id = $1 AND role = 'teacher'
         RETURNING id`,
        [req.auth.id, name ?? null, phone ?? null, phone !== undefined],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Teacher profile not found.' });
      }
    }
    const teacherUpdate = await client.query(
      `UPDATE teacher_profiles
       SET subjects = COALESCE($2, subjects),
           bio = CASE WHEN $5 THEN $3 ELSE bio END,
           hourly_rate = CASE WHEN $6 THEN $4 ELSE hourly_rate END
       WHERE user_id = $1
       RETURNING user_id`,
      [req.auth.id, subjects ?? null, bio ?? null, hourlyRate ?? null, bio !== undefined, hourlyRate !== undefined],
    );
    if (!teacherUpdate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Teacher profile not found.' });
    }
    await client.query('COMMIT');
    await writeAudit(req, { actorId: req.auth.id, event: 'teacher_profile_updated', module: 'profile', targetId: req.auth.id });
    return res.json({ profile: await loadProfile(req.auth.id) });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

teacherRouter.get('/availability', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, teacher_id, weekday, to_char(start_time, 'HH24:MI') AS start_time,
              to_char(end_time, 'HH24:MI') AS end_time
       FROM teacher_availability
       WHERE teacher_id = $1
       ORDER BY weekday, start_time`,
      [req.auth.id],
    );
    return res.json({
      items: rows.map((row) => ({
        id: row.id,
        teacher_id: row.teacher_id,
        day_of_week: row.weekday,
        start_time: row.start_time,
        end_time: row.end_time,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

const availabilitySchema = z.object({
  slots: z
    .array(
      z
        .object({
          day_of_week: z.number().int().min(0).max(6),
          start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        })
        .refine((slot) => slot.end_time > slot.start_time, { message: 'Each slot must end after it starts.' }),
    )
    .max(50),
});

teacherRouter.put('/availability', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  const parsed = availabilitySchema.safeParse(req.body ?? {});
  if (!parsed.success) return validationError(res, parsed);
  const slots = parsed.data.slots;
  const seen = new Set();
  for (const slot of slots) {
    const key = `${slot.day_of_week}|${slot.start_time}|${slot.end_time}`;
    if (seen.has(key)) return res.status(400).json({ error: 'Availability contains duplicate slots.' });
    seen.add(key);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM teacher_availability WHERE teacher_id = $1', [req.auth.id]);
    for (const slot of slots) {
      await client.query(
        `INSERT INTO teacher_availability (teacher_id, weekday, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [req.auth.id, slot.day_of_week, slot.start_time, slot.end_time],
      );
    }
    await client.query('COMMIT');
    await writeAudit(req, {
      actorId: req.auth.id,
      event: 'teacher_availability_updated',
      module: 'availability',
      targetId: req.auth.id,
      details: { slots: slots.length },
    });
    const { rows } = await pool.query(
      `SELECT id, teacher_id, weekday, to_char(start_time, 'HH24:MI') AS start_time,
              to_char(end_time, 'HH24:MI') AS end_time
       FROM teacher_availability
       WHERE teacher_id = $1
       ORDER BY weekday, start_time`,
      [req.auth.id],
    );
    return res.json({
      items: rows.map((row) => ({
        id: row.id,
        teacher_id: row.teacher_id,
        day_of_week: row.weekday,
        start_time: row.start_time,
        end_time: row.end_time,
      })),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

teacherRouter.get('/bookings', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed);
    const statuses = parseStatusFilter(parsed.data.status, BOOKING_STATUSES);
    if (statuses === undefined) return res.status(400).json({ error: 'Unknown booking status filter.' });
    const items = await listBookings(req.auth.id, {
      statuses,
      from: parsed.data.from,
      to: parsed.data.to,
      limit: parsed.data.limit,
    });
    return res.json({ items, bookings: items });
  } catch (error) {
    return next(error);
  }
});

async function decideBooking(req, res, next, id, action) {
  if (!idSchema.safeParse(id).success) return res.status(404).json({ error: 'Booking not found.' });
  const status = action === 'approve' ? 'approved' : 'rejected';
  try {
    const { rows } = await pool.query(
      `UPDATE bookings b SET status = $2
       WHERE b.id = $1 AND b.teacher_id = $3 AND b.status = 'pending'
       RETURNING id`,
      [id, status, req.auth.id],
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Only your own pending bookings can be decided.' });
    }
    await writeAudit(req, {
      actorId: req.auth.id,
      event: `booking_${action}d`,
      module: 'bookings',
      targetId: id,
    });
    const { rows: bookingRows } = await pool.query(
      `SELECT ${bookingRowSql()}
       FROM bookings b JOIN users s ON s.id = b.student_id
       WHERE b.id = $1`,
      [id],
    );
    const booking = bookingRows[0];
    const personResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role
       FROM users u WHERE u.id = ANY($1::uuid[])`,
      [[booking.student_id, booking.teacher_id]],
    );
    const studentRecipient = personResult.rows.find((row) => row.role === 'student');
    void sendBookingDetails(pool, studentRecipient ? [studentRecipient] : [], {
      bookingId: booking.id,
      kind: action === 'approve' ? 'booking_approved' : 'booking_rejected',
      studentName: personResult.rows.find((row) => row.role === 'student')?.name ?? 'Student',
      teacherName: personResult.rows.find((row) => row.role === 'teacher')?.name ?? 'your teacher',
      date: booking.date,
      startTime: booking.start_time,
      endTime: booking.end_time,
      amount: Number(booking.amount),
      meetingUrl: null,
    }).catch((error) => console.error('Booking decision notification failed:', error.message));
    return res.json({ booking: bookingPayload(bookingRows[0]) });
  } catch (error) {
    return next(error);
  }
}

teacherRouter.post('/bookings/:id/approve', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  return decideBooking(req, res, next, req.params.id, 'approve');
});

teacherRouter.post('/bookings/:id/reject', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  return decideBooking(req, res, next, req.params.id, 'reject');
});

const decisionSchema = z.object({ action: z.enum(['approve', 'reject']) });

teacherRouter.patch('/bookings/:id', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Send action: approve or reject.' });
  return decideBooking(req, res, next, req.params.id, parsed.data.action);
});

teacherRouter.get('/sessions', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed);
    const statuses = parseStatusFilter(parsed.data.status, SESSION_STATUSES);
    if (statuses === undefined) return res.status(400).json({ error: 'Unknown session status filter.' });
    const clauses = ['b.teacher_id = $1'];
    const params = [req.auth.id];
    if (statuses) {
      params.push(statuses);
      clauses.push(`cs.status = ANY($${params.length})`);
    }
    if (parsed.data.from) {
      params.push(parsed.data.from);
      clauses.push(`b.starts_at >= $${params.length}`);
    }
    if (parsed.data.to) {
      params.push(parsed.data.to);
      clauses.push(`b.starts_at < $${params.length}`);
    }
    let limitClause = '';
    if (parsed.data.limit) {
      params.push(parsed.data.limit);
      limitClause = `LIMIT $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT ${sessionRowSql()}
       FROM class_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN users s ON s.id = b.student_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY b.starts_at DESC
       ${limitClause}`,
      params,
    );
    return res.json({ items: rows.map(sessionPayload) });
  } catch (error) {
    return next(error);
  }
});

teacherRouter.get('/sessions/:id', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Class session not found.' });
    }
    const row = await loadSession(req.auth.id, req.params.id);
    if (!row) return res.status(404).json({ error: 'Class session not found.' });
    const { rows: attendanceRows } = await pool.query(
      `SELECT ar.id, ar.session_id, ar.user_id, u.name AS user_name, ar.joined_at, ar.left_at
       FROM attendance_records ar JOIN users u ON u.id = ar.user_id
       WHERE ar.session_id = $1
       ORDER BY ar.joined_at NULLS LAST, u.name`,
      [row.id],
    );
    return res.json({ session: sessionPayload(row), attendance: attendanceRows });
  } catch (error) {
    return next(error);
  }
});

teacherRouter.post('/sessions/:id/meeting', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Class session not found.' });
    }
    const row = await loadSession(req.auth.id, req.params.id);
    if (!row) return res.status(404).json({ error: 'Class session not found.' });
    if (['cancelled', 'completed'].includes(row.status)) {
      return res.status(400).json({ error: 'This class is no longer available to join.' });
    }

    const result = await ensureSessionMeeting(row.id, { allowBeforeStart: true });
    const httpStatus = result.status === 'not_found' ? 404
      : result.status === 'not_configured' ? 503
        : result.status === 'failed' ? 502
          : result.status === 'unavailable' ? 400
            : 200;
    return res.status(httpStatus).json({
      status: result.status,
      joinUrl: result.joinUrl ?? result.session?.meeting_url ?? null,
      meetingId: result.meetingId ?? null,
      error: result.error ?? null,
      missingKeys: result.missingKeys ?? [],
    });
  } catch (error) {
    return next(error);
  }
});

async function ensureMeeting(row) {
  if (row.meeting_url) return row;
  await ensureSessionMeeting(row.id);
  return (await loadSession(row.teacher_id, row.id)) ?? row;
}

teacherRouter.post('/sessions/:id/start', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Class session not found.' });
    }
    let row = await loadSession(req.auth.id, req.params.id);
    if (!row) return res.status(404).json({ error: 'Class session not found.' });
    if (row.status !== 'scheduled') {
      return res.status(400).json({ error: 'Only a scheduled class session can be started.' });
    }
    try {
      row = await ensureMeeting(row);
    } catch (error) {
      console.error('Teacher meeting creation failed:', error.message);
      row = (await loadSession(req.auth.id, req.params.id)) ?? row;
    }
    if (!row) return res.status(404).json({ error: 'Class session not found.' });
    const { rows } = await pool.query(
      `UPDATE class_sessions
       SET status = 'ongoing', started_at = now()
       WHERE id = $1 AND status = 'scheduled'
       RETURNING id`,
      [row.id],
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Only a scheduled class session can be started.' });
    }
    await writeAudit(req, {
      actorId: req.auth.id,
      event: 'class_session_started',
      module: 'live_classes',
      targetId: row.id,
    });
    return res.json({ session: sessionPayload(await loadSession(req.auth.id, row.id)) });
  } catch (error) {
    return next(error);
  }
});

teacherRouter.post('/sessions/:id/end', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!idSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Class session not found.' });
    }
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT cs.id, cs.status, cs.booking_id
       FROM class_sessions cs JOIN bookings b ON b.id = cs.booking_id
       WHERE cs.id = $1 AND b.teacher_id = $2
       FOR UPDATE OF cs`,
      [req.params.id, req.auth.id],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Class session not found.' });
    }
    const session = rows[0];
    if (session.status !== 'ongoing') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only an ongoing class session can be ended.' });
    }
    await client.query(
      `UPDATE class_sessions SET status = 'completed', ended_at = now() WHERE id = $1`,
      [session.id],
    );
    await client.query(
      `UPDATE bookings SET status = 'completed'
       WHERE id = $1 AND status IN ('paid', 'approved')`,
      [session.booking_id],
    );
    await client.query('COMMIT');
    await writeAudit(req, {
      actorId: req.auth.id,
      event: 'class_session_ended',
      module: 'live_classes',
      targetId: session.id,
    });
    return res.json({ session: sessionPayload(await loadSession(req.auth.id, session.id)) });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

const consentSchema = z.object({ consent: z.boolean() });

teacherRouter.patch('/sessions/:id/recording-consent', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    if (!idSchema.safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Class session not found.' });
    }
    const parsed = consentSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Send consent as true or false.' });
    const { rows } = await pool.query(
      `UPDATE class_sessions cs SET recording_consent = $3
       FROM bookings b
       WHERE cs.id = $1 AND cs.booking_id = b.id AND b.teacher_id = $2
       RETURNING cs.id`,
      [req.params.id, req.auth.id, parsed.data.consent],
    );
    if (!rows.length) return res.status(404).json({ error: 'Class session not found.' });
    await writeAudit(req, {
      actorId: req.auth.id,
      event: 'recording_consent_updated',
      module: 'live_classes',
      targetId: req.params.id,
      details: { consent: parsed.data.consent },
    });
    return res.json({ session: sessionPayload(await loadSession(req.auth.id, req.params.id)) });
  } catch (error) {
    return next(error);
  }
});

teacherRouter.get('/feedback', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.id, f.booking_id, f.student_id, u.name AS student_name, f.teacher_id,
              f.rating, f.testimony_text, f.allow_display, f.created_at
       FROM feedback f JOIN users u ON u.id = f.student_id
       WHERE f.teacher_id = $1
       ORDER BY f.created_at DESC
       LIMIT 200`,
      [req.auth.id],
    );
    return res.json({ items: rows });
  } catch (error) {
    return next(error);
  }
});

teacherRouter.get('/dashboard/stats', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM bookings WHERE teacher_id = $1) AS total_bookings,
        (SELECT COUNT(*)::int FROM bookings WHERE teacher_id = $1 AND status = 'pending') AS pending_bookings,
        (SELECT COUNT(*)::int FROM class_sessions cs JOIN bookings b ON b.id = cs.booking_id
          WHERE b.teacher_id = $1 AND cs.status = 'scheduled') AS upcoming_sessions,
        (SELECT COUNT(*)::int FROM class_sessions cs JOIN bookings b ON b.id = cs.booking_id
          WHERE b.teacher_id = $1 AND cs.status = 'completed') AS completed_sessions,
        (SELECT COALESCE(SUM(amount), 0) FROM bookings
          WHERE teacher_id = $1 AND status IN ('paid', 'completed')) AS total_earnings,
        (SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0) FROM feedback
          WHERE teacher_id = $1) AS average_rating`,
      [req.auth.id],
    );
    const row = rows[0];
    return res.json({
      stats: {
        totalBookings: row.total_bookings,
        pendingBookings: row.pending_bookings,
        upcomingSessions: row.upcoming_sessions,
        completedSessions: row.completed_sessions,
        totalEarnings: Number(row.total_earnings),
        averageRating: Number(row.average_rating),
      },
    });
  } catch (error) {
    return next(error);
  }
});
