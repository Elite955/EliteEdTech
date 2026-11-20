import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuthenticatedUser } from '../security/authMiddleware.js';
import { sendBookingNotice } from '../notifications/bookingNotifications.js';
import { createTestZoomMeeting, isZoomTestConfigured } from '../integrations/zoom.js';

export const studentRouter = Router();
export const teacherRouter = Router();

function requireRole(role) {
  return (req, res, next) => {
    if (req.auth.account_role !== role) return res.status(403).json({ error: 'This account cannot access that workspace.' });
    return next();
  };
}

const student = [requireAuthenticatedUser, requireRole('student')];
const teacher = [requireAuthenticatedUser, requireRole('teacher')];
const uuidSchema = z.string().uuid();
const availabilitySchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
});

studentRouter.get('/teachers', ...student, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, tp.subjects, tp.hourly_rate
       FROM users u JOIN teacher_profiles tp ON tp.user_id = u.id
      WHERE u.role = 'teacher' AND u.status = 'active'
       ORDER BY u.name`,
    );
    return res.json({ teachers: rows });
  } catch (error) { return next(error); }
});

studentRouter.get('/teachers/:id/slots', ...student, async (req, res, next) => {
  const teacherId = uuidSchema.safeParse(req.params.id);
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.date);
  if (!teacherId.success || !date.success) return res.status(400).json({ error: 'Choose a valid teacher and date.' });
  try {
    const { rows } = await pool.query(
      `SELECT id, starts_at, ends_at FROM teacher_availability_slots
       WHERE teacher_id = $1 AND status = 'open' AND starts_at > now()
         AND (starts_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date
       ORDER BY starts_at`,
      [teacherId.data, date.data],
    );
    return res.json({ slots: rows });
  } catch (error) { return next(error); }
});

studentRouter.post('/bookings', ...student, async (req, res, next) => {
  const input = z.object({ availability_id: uuidSchema }).safeParse(req.body ?? {});
  if (!input.success) return res.status(400).json({ error: 'Choose an available session time.' });
  const client = await pool.connect();
  let booking;
  let studentDetails;
  try {
    await client.query('BEGIN');
    const slot = await client.query(
      `SELECT a.id, a.teacher_id, a.starts_at, a.ends_at, tp.hourly_rate, u.name AS teacher_name
      FROM teacher_availability_slots a
       JOIN users u ON u.id = a.teacher_id
       JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE a.id = $1 AND a.status = 'open' AND a.starts_at > now()
         AND u.status = 'active'
       FOR UPDATE OF a`,
      [input.data.availability_id],
    );
    if (!slot.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'That time is no longer available. Please choose another slot.' });
    }
    const selected = slot.rows[0];
    const durationHours = (new Date(selected.ends_at) - new Date(selected.starts_at)) / 3_600_000;
    if (durationHours <= 0 || durationHours > 8) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The selected time is not a valid session length.' });
    }
    const created = await client.query(
      `INSERT INTO bookings (student_id, teacher_id, availability_id, starts_at, ends_at, amount)
       VALUES ($1, $2, $3, $4, $5, round($6::numeric * $7::numeric, 2))
       RETURNING id, status, starts_at, ends_at, amount`,
      [req.auth.id, selected.teacher_id, selected.id, selected.starts_at, selected.ends_at, selected.hourly_rate ?? 0, durationHours],
    );
    await client.query(`UPDATE teacher_availability_slots SET status = 'booked' WHERE id = $1`, [selected.id]);
    const person = await client.query('SELECT id, name, email, phone FROM users WHERE id = $1', [req.auth.id]);
    booking = { ...created.rows[0], teacher_name: selected.teacher_name };
    studentDetails = person.rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }

  void sendBookingNotice(pool, {
    kind: 'requested', student: studentDetails, teacherName: booking.teacher_name, startsAt: booking.starts_at,
  }).catch((error) => console.error('Booking request notification failed:', error.message));
  return res.status(201).json({ booking });
});

studentRouter.get('/bookings', ...student, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.status, b.starts_at, b.ends_at, b.amount, t.name AS teacher_name
       FROM bookings b JOIN users t ON t.id = b.teacher_id
       WHERE b.student_id = $1 ORDER BY b.starts_at DESC LIMIT 100`,
      [req.auth.id],
    );
    return res.json({ bookings: rows });
  } catch (error) { return next(error); }
});

studentRouter.get('/sessions', ...student, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT cs.id AS session_id, cs.status, cs.meeting_creation_status,
              (cs.meeting_url IS NOT NULL) AS meeting_ready,
              b.id AS booking_id, b.starts_at, b.ends_at, b.amount, t.name AS teacher_name
       FROM class_sessions cs JOIN bookings b ON b.id = cs.booking_id
       JOIN users t ON t.id = b.teacher_id
       WHERE b.student_id = $1 AND cs.status IN ('scheduled', 'ongoing')
       ORDER BY b.starts_at LIMIT 100`,
      [req.auth.id],
    );
    return res.json({ sessions: rows });
  } catch (error) { return next(error); }
});

studentRouter.post('/sessions/:id/join', ...student, async (req, res, next) => {
  const sessionId = uuidSchema.safeParse(req.params.id);
  if (!sessionId.success) return res.status(404).json({ error: 'Class session not found.' });
  try {
    const { rows } = await pool.query(
      `SELECT cs.meeting_url, cs.status, b.starts_at, b.ends_at
       FROM class_sessions cs JOIN bookings b ON b.id = cs.booking_id
       WHERE cs.id = $1 AND b.student_id = $2`,
      [sessionId.data, req.auth.id],
    );
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Class session not found.' });
    if (session.status !== 'scheduled' && session.status !== 'ongoing') {
      return res.status(409).json({ error: 'This class is no longer available to join.' });
    }
    const now = Date.now();
    if (now < new Date(session.starts_at).getTime()) {
      return res.status(403).json({ error: 'Your class has not started yet. Return to the portal when the countdown ends.' });
    }
    if (now > new Date(session.ends_at).getTime() + 10 * 60_000) {
      return res.status(410).json({ error: 'The scheduled class time has ended.' });
    }
    if (!session.meeting_url) return res.status(409).json({ error: 'The meeting link is not ready yet. Please check again shortly.' });
    return res.json({ join_url: session.meeting_url });
  } catch (error) { return next(error); }
});

teacherRouter.get('/availability', ...teacher, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, starts_at, ends_at, status FROM teacher_availability_slots
       WHERE teacher_id = $1 AND status = 'open' AND ends_at > now()
       ORDER BY starts_at LIMIT 100`,
      [req.auth.id],
    );
    return res.json({ availability: rows });
  } catch (error) { return next(error); }
});

teacherRouter.post('/availability', ...teacher, async (req, res, next) => {
  const input = availabilitySchema.safeParse(req.body ?? {});
  if (!input.success) return res.status(400).json({ error: 'Enter a valid start and end time.' });
  const startsAt = new Date(input.data.starts_at);
  const endsAt = new Date(input.data.ends_at);
  const durationMinutes = (endsAt - startsAt) / 60_000;
  if (startsAt <= new Date() || durationMinutes < 15 || durationMinutes > 480) {
    return res.status(400).json({ error: 'Availability must be in the future and between 15 minutes and 8 hours long.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.auth.id]);
    const conflict = await client.query(
      `SELECT 1 FROM teacher_availability_slots
       WHERE teacher_id = $1 AND status IN ('open', 'booked')
         AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
      [req.auth.id, startsAt, endsAt],
    );
    if (conflict.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This time overlaps another available or booked session.' });
    }
    const { rows } = await client.query(
      `INSERT INTO teacher_availability_slots (teacher_id, starts_at, ends_at)
       VALUES ($1, $2, $3) RETURNING id, starts_at, ends_at, status`,
      [req.auth.id, startsAt, endsAt],
    );
    await client.query('COMMIT');
    return res.status(201).json({ availability: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});

teacherRouter.get('/bookings', ...teacher, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.status, b.starts_at, b.ends_at, b.amount, s.name AS student_name
       FROM bookings b JOIN users s ON s.id = b.student_id
       WHERE b.teacher_id = $1 ORDER BY b.starts_at DESC LIMIT 100`,
      [req.auth.id],
    );
    return res.json({ bookings: rows });
  } catch (error) { return next(error); }
});

teacherRouter.patch('/bookings/:id', ...teacher, async (req, res, next) => {
  const bookingId = uuidSchema.safeParse(req.params.id);
  const input = z.object({ action: z.enum(['approve', 'reject']) }).safeParse(req.body ?? {});
  if (!bookingId.success || !input.success) return res.status(400).json({ error: 'Choose approve or reject for a valid booking.' });
  const client = await pool.connect();
  let booking;
  let studentDetails;
  let session;
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT b.id, b.status, b.availability_id, b.starts_at, b.ends_at,
              s.id AS student_id, s.name AS student_name, s.email, s.phone, t.name AS teacher_name
       FROM bookings b JOIN users s ON s.id = b.student_id JOIN users t ON t.id = b.teacher_id
       WHERE b.id = $1 AND b.teacher_id = $2 FOR UPDATE OF b`,
      [bookingId.data, req.auth.id],
    );
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found.' });
    }
    booking = found.rows[0];
    if (booking.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This booking has already been resolved.' });
    }
    if (input.data.action === 'approve' && new Date(booking.starts_at) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A session cannot be approved after its start time.' });
    }
    const nextStatus = input.data.action === 'approve' ? 'approved' : 'rejected';
    await client.query('UPDATE bookings SET status = $2 WHERE id = $1', [booking.id, nextStatus]);
    if (input.data.action === 'reject') {
      await client.query(`UPDATE teacher_availability_slots SET status = 'open' WHERE id = $1`, [booking.availability_id]);
    } else {
      const { rows } = await client.query(
        `INSERT INTO class_sessions (booking_id, meeting_provider, status)
         VALUES ($1, 'zoom', 'scheduled')
         ON CONFLICT (booking_id) DO UPDATE SET status = 'scheduled'
         RETURNING id`,
        [booking.id],
      );
      session = rows[0];
    }
    studentDetails = { id: booking.student_id, name: booking.student_name, email: booking.email, phone: booking.phone };
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }

  if (input.data.action === 'approve' && isZoomTestConfigured()) {
    try {
      await pool.query(`UPDATE class_sessions SET meeting_creation_status = 'creating' WHERE id = $1`, [session.id]);
      const meeting = await createTestZoomMeeting({
        topic: `EdTech class ${booking.id}`,
        startTime: new Date(booking.starts_at).toISOString(),
        durationMinutes: Math.ceil((new Date(booking.ends_at) - new Date(booking.starts_at)) / 60_000),
      });
      await pool.query(
        `UPDATE class_sessions SET meeting_url = $2, meeting_creation_status = 'created' WHERE id = $1`,
        [session.id, meeting.joinUrl],
      );
    } catch (error) {
      const status = error.outcomeUncertain ? 'unknown' : 'failed';
      await pool.query(`UPDATE class_sessions SET meeting_creation_status = $2 WHERE id = $1`, [session.id, status]);
      console.error('Test Zoom meeting creation failed:', error.message);
    }
  }

  void sendBookingNotice(pool, {
    kind: input.data.action === 'approve' ? 'confirmed' : 'rejected',
    student: studentDetails,
    teacherName: booking.teacher_name,
    startsAt: booking.starts_at,
    sessionId: session?.id ?? null,
  }).catch((error) => console.error('Booking decision notification failed:', error.message));
  return res.json({ booking: { id: booking.id, status: input.data.action === 'approve' ? 'approved' : 'rejected' } });
});