import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuthenticatedUser } from '../security/authMiddleware.js';
import { writeAudit } from '../security/audit.js';
import { createOrder, publicKeyId, razorpayConfigured, verifyPaymentSignature, verifyWebhookSignature } from '../payments/razorpay.js';
import { ensureSessionMeeting } from '../meetings/service.js';
import { selectedMeetingProviderId } from '../meetings/provider.js';
import { buildPaymentReceipt } from '../payments/receipt.js';
import { sendBookingDetails } from '../notifications/notifier.js';

export const studentRouter = Router();

const IST_ZONE = 'Asia/Kolkata';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function requireStudent(req, res, next) {
  if (req.auth.account_role !== 'student') {
    return res.status(403).json({ error: 'This area is available to student accounts only.' });
  }
  return next();
}

function toIstTimestamp(date, time) {
  return new Date(`${date}T${time}:00+05:30`);
}

function minutesBetween(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function validationError(res, result) {
  return res.status(400).json({ error: 'Some details are missing or invalid.', details: result.error.issues });
}

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,20}$/).nullable().optional(),
  age: z.number().int().min(5).max(100).nullable().optional(),
  grade: z.string().trim().max(80).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one profile field to update.',
});

async function loadStudentProfile(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at, sp.age, sp.grade
     FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'student'`,
    [userId],
  );
  return rows[0] ?? null;
}

studentRouter.get('/profile', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const profile = await loadStudentProfile(req.auth.id);
    if (!profile) return res.status(404).json({ error: 'Student profile not found.' });
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
});

studentRouter.patch('/profile', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const data = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE users SET name = COALESCE($2, name),
         phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
         updated_at = now()
       WHERE id = $1 AND role = 'student'`,
      [req.auth.id, data.name ?? null, Object.hasOwn(data, 'phone'), data.phone ?? null],
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    if (Object.hasOwn(data, 'age') || Object.hasOwn(data, 'grade')) {
      await client.query(
        `INSERT INTO student_profiles (user_id, age, grade) VALUES ($1, $3, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           age = CASE WHEN $2::boolean THEN $3 ELSE student_profiles.age END,
           grade = CASE WHEN $4::boolean THEN $5 ELSE student_profiles.grade END`,
        [req.auth.id, Object.hasOwn(data, 'age'), data.age ?? null, Object.hasOwn(data, 'grade'), data.grade ?? null],
      );
    }
    await client.query('COMMIT');
    await writeAudit(req, {
      actorId: req.auth.id,
      event: 'student_profile_updated',
      module: 'profile',
      targetId: req.auth.id,
      details: { fields: Object.keys(data) },
    });
    return res.json({ message: 'Profile updated.', profile: await loadStudentProfile(req.auth.id) });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

const teacherQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
});

studentRouter.get('/teachers', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const parsed = teacherQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed);
    const search = parsed.data.search ?? '';
    const pattern = `%${search}%`;
    const { rows } = await pool.query(
      `SELECT u.id, u.name, tp.subjects, tp.bio, tp.hourly_rate,
              COALESCE(
                json_agg(
                  jsonb_build_object('day', ta.weekday, 'start', to_char(ta.start_time, 'HH24:MI'), 'end', to_char(ta.end_time, 'HH24:MI'))
                  ORDER BY ta.weekday, ta.start_time
                ) FILTER (WHERE ta.id IS NOT NULL),
                '[]'::json
              ) AS availability
       FROM users u
       JOIN teacher_profiles tp ON tp.user_id = u.id
       LEFT JOIN teacher_availability ta ON ta.teacher_id = u.id
       WHERE u.role = 'teacher' AND u.status = 'active' AND tp.approved = true
         AND ($1 = '' OR u.name ILIKE $2 OR tp.bio ILIKE $2 OR $1 = ANY(tp.subjects) OR EXISTS (
           SELECT 1 FROM unnest(tp.subjects) AS s WHERE s ILIKE $2
         ))
       GROUP BY u.id, u.name, tp.subjects, tp.bio, tp.hourly_rate
       ORDER BY u.name`,
      [search, pattern],
    );
    return res.json({
      teachers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        subjects: row.subjects ?? [],
        bio: row.bio,
        hourly_rate: Number(row.hourly_rate),
        availability: row.availability.map((slot) => ({ day: WEEKDAYS[slot.day], start: slot.start, end: slot.end })),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

studentRouter.get('/teachers/:id', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, tp.subjects, tp.bio, tp.hourly_rate
       FROM users u JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'teacher' AND u.status = 'active' AND tp.approved = true`,
      [req.params.id],
    );
    const teacher = rows[0];
    if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });
    const { rows: slots } = await pool.query(
      `SELECT weekday, to_char(start_time, 'HH24:MI') AS start, to_char(end_time, 'HH24:MI') AS "end"
       FROM teacher_availability WHERE teacher_id = $1 ORDER BY weekday, start_time`,
      [teacher.id],
    );
    return res.json({
      teacher: {
        id: teacher.id,
        name: teacher.name,
        subjects: teacher.subjects ?? [],
        bio: teacher.bio,
        hourly_rate: Number(teacher.hourly_rate),
        availability: slots.map((slot) => ({ day: WEEKDAYS[slot.weekday], start: slot.start, end: slot.end })),
      },
    });
  } catch (error) {
    return next(error);
  }
});

const bookingSchema = z.object({
  teacher_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

function bookingRowSql(alias = 'b') {
  return `${alias}.id, ${alias}.status, ${alias}.amount, ${alias}.created_at,
    to_char(${alias}.starts_at AT TIME ZONE '${IST_ZONE}', 'YYYY-MM-DD') AS date,
    to_char(${alias}.starts_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS start_time,
    to_char(${alias}.ends_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS end_time`;
}

studentRouter.post('/bookings', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    const { teacher_id, date, start_time, end_time } = parsed.data;

    const minutes = minutesBetween(start_time, end_time);
    if (minutes <= 0) return res.status(400).json({ error: 'The session must end after it starts.' });
    if (minutes > 8 * 60) return res.status(400).json({ error: 'Sessions are limited to 8 hours.' });

    const startsAt = toIstTimestamp(date, start_time);
    const endsAt = toIstTimestamp(date, end_time);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return res.status(400).json({ error: 'The requested date or time is not valid.' });
    }
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

    const { rows: teacherRows } = await pool.query(
      `SELECT u.id, u.name, tp.hourly_rate
       FROM users u JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'teacher' AND u.status = 'active' AND tp.approved = true AND tp.hourly_rate IS NOT NULL`,
      [teacher_id],
    );
    const teacher = teacherRows[0];
    if (!teacher) return res.status(404).json({ error: 'This teacher is not accepting bookings.' });

    const { rows: windowRows } = await pool.query(
      `SELECT 1 FROM teacher_availability
       WHERE teacher_id = $1 AND weekday = $2 AND $3::time >= start_time AND $4::time <= end_time`,
      [teacher_id, weekday, start_time, end_time],
    );
    if (!windowRows.length) {
      return res.status(400).json({ error: 'That slot is outside the teacher’s availability. Pick another time.' });
    }

    const { rows: clashRows } = await pool.query(
      `SELECT 1 FROM bookings
       WHERE teacher_id = $1 AND status NOT IN ('rejected', 'cancelled') AND starts_at < $3 AND ends_at > $2`,
      [teacher_id, startsAt, endsAt],
    );
    if (clashRows.length) {
      return res.status(409).json({ error: 'That slot was just booked by someone else. Pick another time.' });
    }

    const hours = minutes / 60;
    const amount = Math.round(hours * Number(teacher.hourly_rate) * 100) / 100;

    const { rows: inserted } = await pool.query(
      `INSERT INTO bookings (student_id, teacher_id, starts_at, ends_at, amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, amount, created_at,
         to_char(starts_at AT TIME ZONE '${IST_ZONE}', 'YYYY-MM-DD') AS date,
         to_char(starts_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS start_time,
         to_char(ends_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS end_time`,
      [req.auth.id, teacher_id, startsAt, endsAt, amount],
    );
    await writeAudit(req, { actorId: req.auth.id, event: 'booking_created', module: 'bookings', targetId: inserted[0].id });
    const { rows: studentRows } = await pool.query(
      `SELECT id, name, email, phone, role FROM users WHERE id = $1`,
      [req.auth.id],
    );
    void sendBookingDetails(pool, studentRows, {
      bookingId: inserted[0].id,
      kind: 'booking_request',
      studentName: studentRows[0]?.name ?? 'Student',
      teacherName: teacher.name,
      date: inserted[0].date,
      startTime: inserted[0].start_time,
      endTime: inserted[0].end_time,
      amount,
      meetingUrl: null,
    }).catch((error) => console.error('Booking request notification failed:', error.message));
    return res.status(201).json({
      booking: {
        ...inserted[0],
        amount: Number(inserted[0].amount),
        teacher: { id: teacher.id, name: teacher.name },
      },
    });
  } catch (error) {
    return next(error);
  }
});

studentRouter.get('/bookings/mine', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${bookingRowSql()}, t.id AS teacher_id, t.name AS teacher_name
       FROM bookings b JOIN users t ON t.id = b.teacher_id
       WHERE b.student_id = $1
       ORDER BY b.starts_at DESC`,
      [req.auth.id],
    );
    return res.json({
      bookings: rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
        teacher: { id: row.teacher_id, name: row.teacher_name },
      })),
    });
  } catch (error) {
    return next(error);
  }
});

const orderSchema = z.object({ booking_id: z.string().uuid() });

studentRouter.post('/payments/order', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    if (!razorpayConfigured()) {
      return res.status(503).json({ error: 'Payments are not configured yet. Ask your platform owner to add Razorpay test keys.' });
    }

    const { rows } = await pool.query(
      `SELECT id, amount, status FROM bookings WHERE id = $1 AND student_id = $2`,
      [parsed.data.booking_id, req.auth.id],
    );
    const booking = rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved bookings can be paid for.' });
    }

    const order = await createOrder({
      amountInRupees: booking.amount,
      receipt: booking.id,
      notes: { booking_id: booking.id },
    });

    await pool.query(
      `INSERT INTO payments (booking_id, student_id, provider, provider_transaction_id, provider_order_id, amount, status)
       VALUES ($1, $2, 'razorpay', $3, $3, $4, 'pending')`,
      [booking.id, req.auth.id, order.id, booking.amount],
    );
    await writeAudit(req, { actorId: req.auth.id, event: 'payment_order_created', module: 'transactions', targetId: order.id });

    return res.status(201).json({
      key_id: publicKeyId(),
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    return next(error);
  }
});

const verifySchema = z.object({
  razorpay_order_id: z.string().min(4).max(128),
  razorpay_payment_id: z.string().min(4).max(128),
  razorpay_signature: z.string().min(8).max(256),
});

async function markBookingPaid(req, { bookingId, orderId, paymentId }) {
  await pool.query(
    `UPDATE payments SET status = 'succeeded', provider_transaction_id = $3, updated_at = now()
     WHERE booking_id = $1 AND COALESCE(provider_order_id, provider_transaction_id) = $2
       AND status = 'pending'`,
    [bookingId, orderId, paymentId],
  );
  const { rows } = await pool.query(
    `UPDATE bookings SET status = 'paid' WHERE id = $1 AND status = 'approved' RETURNING id, student_id, teacher_id, starts_at, ends_at, amount`,
    [bookingId],
  );
  if (!rows.length) return null;
  const booking = rows[0];

  const { rows: sessionRows } = await pool.query(
    `INSERT INTO class_sessions (booking_id, meeting_provider, meeting_url, status)
     VALUES ($1, $2, $3, 'scheduled') RETURNING id, meeting_url`,
    [booking.id, selectedMeetingProviderId(), null],
  );
  const session = sessionRows[0];

  return { booking, session };
}

async function notifyPaidBooking(booking) {
  const { rows: personRows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.role
     FROM users u WHERE u.id = ANY($1::uuid[])`,
    [[booking.student_id, booking.teacher_id]],
  );
  const student = personRows.find((row) => row.role === 'student');
  const teacher = personRows.find((row) => row.role === 'teacher');
  const [{ rows: sessionRows }, { rows: paymentRows }] = await Promise.all([
    pool.query(`SELECT meeting_url FROM class_sessions WHERE booking_id = $1`, [booking.id]),
    pool.query(
      `SELECT id, provider, provider_transaction_id, amount, status, created_at
       FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [booking.id],
    ),
  ]);
  const meetingUrl = sessionRows[0]?.meeting_url ?? null;
  let receiptBuffer = null;
  if (paymentRows[0]) {
    try {
      receiptBuffer = await buildPaymentReceipt({
        payment: paymentRows[0],
        booking,
        student,
        teacher,
        meetingUrl,
      });
    } catch (error) {
      console.error('Receipt generation failed:', error.message);
    }
  }
  const date = new Date(booking.starts_at).toLocaleDateString('en-IN', { timeZone: IST_ZONE });
  const startTime = new Date(booking.starts_at).toLocaleTimeString('en-IN', {
    timeZone: IST_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const endTime = new Date(booking.ends_at).toLocaleTimeString('en-IN', {
    timeZone: IST_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return sendBookingDetails(pool, personRows, {
    bookingId: booking.id,
    studentName: student?.name ?? 'Student',
    teacherName: teacher?.name ?? 'your teacher',
    date,
    startTime,
    endTime,
    amount: Number(booking.amount),
    meetingUrl,
    directMeetingLinkForStudent: true,
    receiptBuffer,
    receiptFilename: `ELITE-receipt-${String(paymentRows[0]?.id ?? booking.id).slice(0, 8)}.pdf`,
  });
}

async function finalizePaidBooking(result) {
  // Create the join link at payment time so the confirmation email/WhatsApp
  // already contains it, instead of waiting for the class to start.
  const meeting = await ensureSessionMeeting(result.session.id, { allowBeforeStart: true });
  const delivery = await notifyPaidBooking(result.booking);
  return { ...result, meeting, delivery };
}

async function completePaidBooking(req, { bookingId, orderId, paymentId }) {
  const result = await markBookingPaid(req, { bookingId, orderId, paymentId });
  if (!result) return null;
  return finalizePaidBooking(result);
}

studentRouter.post('/payments/verify', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

    if (!verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature })) {
      await writeAudit(req, { actorId: req.auth.id, event: 'payment_signature_invalid', module: 'transactions', targetId: razorpay_order_id });
      return res.status(400).json({ error: 'The payment signature could not be verified. Contact support before retrying.' });
    }

    const { rows } = await pool.query(
      `SELECT booking_id FROM payments
       WHERE COALESCE(provider_order_id, provider_transaction_id) = $1
         AND student_id = $2 AND status = 'pending'`,
      [razorpay_order_id, req.auth.id],
    );
    const payment = rows[0];
    if (!payment) {
      return res.status(400).json({ error: 'No pending payment matches this checkout session.' });
    }

    // The payment is already confirmed by the signature. A meeting-provider or
    // notification failure must never make the browser report a failed payment
    // and trigger a second checkout.
    try {
      await completePaidBooking(req, {
        bookingId: payment.booking_id, orderId: razorpay_order_id, paymentId: razorpay_payment_id,
      });
    } catch (error) {
      console.error('Post-payment processing failed:', error.message);
      await writeAudit(req, {
        actorId: req.auth.id,
        event: 'payment_finalization_failed',
        module: 'transactions',
        targetId: razorpay_payment_id,
        details: { error: error.message },
      });
      return res.json({
        status: 'paid',
        warning: 'Payment confirmed. If the join link is missing, open the portal Sessions page in a few minutes.',
      });
    }

    await writeAudit(req, { actorId: req.auth.id, event: 'payment_succeeded', module: 'transactions', targetId: razorpay_payment_id });
    return res.json({ status: 'paid' });
  } catch (error) {
    return next(error);
  }
});

studentRouter.post('/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res, next) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
    const signature = req.get('x-razorpay-signature');
    if (!verifyWebhookSignature({ rawBody, signature })) {
      return res.status(400).json({ error: 'Webhook signature verification failed.' });
    }
    const event = JSON.parse(rawBody);
    const entity = event?.payload?.payment?.entity;
    if (event?.event === 'payment.captured' && entity) {
      const { rows } = await pool.query(
        `SELECT booking_id FROM payments
         WHERE COALESCE(provider_order_id, provider_transaction_id) = $1 AND status = 'pending'`,
        [entity.order_id],
      );
      if (rows.length) {
        const result = await markBookingPaid(req, {
          bookingId: rows[0].booking_id, orderId: entity.order_id, paymentId: entity.id,
        });
        if (result) {
          void finalizePaidBooking(result).catch((error) => {
            console.error('Post-payment finalization failed:', error.message);
          });
        }
      }
    }
    return res.json({ received: true });
  } catch (error) {
    return next(error);
  }
});

studentRouter.get('/payments/mine', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, booking_id, provider, provider_transaction_id, provider_order_id, amount, status, created_at
       FROM payments WHERE student_id = $1 ORDER BY created_at DESC`,
      [req.auth.id],
    );
    return res.json({
      payments: rows.map((row) => ({ ...row, amount: Number(row.amount) })),
    });
  } catch (error) {
    return next(error);
  }
});

studentRouter.get('/payments/:id/receipt', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Receipt not found.' });
    }
    const { rows } = await pool.query(
      `SELECT p.id, p.provider, p.provider_transaction_id, p.amount, p.status, p.created_at,
              b.id AS booking_id, b.starts_at, b.ends_at,
              s.id AS student_id, s.name AS student_name, s.email AS student_email,
              t.name AS teacher_name,
              cs.meeting_url
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       JOIN users s ON s.id = b.student_id
       JOIN users t ON t.id = b.teacher_id
       LEFT JOIN class_sessions cs ON cs.booking_id = b.id
       WHERE p.id = $1 AND b.student_id = $2`,
      [req.params.id, req.auth.id],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Receipt not found.' });

    const pdf = await buildPaymentReceipt({
      payment: row,
      booking: row,
      student: { id: row.student_id, name: row.student_name, email: row.student_email },
      teacher: { name: row.teacher_name },
      meetingUrl: row.meeting_url,
    });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="ELITE-receipt-${req.params.id.slice(0, 8)}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    return next(error);
  }
});

studentRouter.get('/sessions/mine', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT cs.id AS session_id, cs.booking_id, cs.meeting_url, cs.meeting_provider, cs.meeting_creation_status,
              cs.started_at, cs.ended_at, cs.recording_url, cs.recording_consent, cs.status,
              b.status AS booking_status,
              t.name AS teacher_name,
              b.starts_at AS start_at,
              b.ends_at AS end_at,
              to_char(b.starts_at AT TIME ZONE '${IST_ZONE}', 'YYYY-MM-DD') AS date,
              to_char(b.starts_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS start_time,
              to_char(b.ends_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS end_time,
              CASE WHEN cs.started_at IS NOT NULL AND cs.ended_at IS NOT NULL
                   THEN GREATEST(ROUND(EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at)) / 60)::int, 0)
                   ELSE NULL END AS duration_minutes,
              (SELECT count(*) FROM attendance_records a WHERE a.session_id = cs.id) AS attendance_count
       FROM class_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN users t ON t.id = b.teacher_id
       WHERE b.student_id = $1
       ORDER BY b.starts_at DESC`,
      [req.auth.id],
    );
    return res.json({
      sessions: rows.map((row) => ({
        ...row,
        teacher: { name: row.teacher_name },
        attendance_count: Number(row.attendance_count),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

studentRouter.post('/sessions/:id/attendance', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Class session not found.' });
    }
    const input = z.object({ action: z.enum(['join', 'leave']) }).safeParse(req.body ?? {});
    if (!input.success) return validationError(res, input);

    const { rows: sessions } = await pool.query(
      `SELECT cs.id, cs.status, b.status AS booking_status
       FROM class_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       WHERE cs.id = $1 AND b.student_id = $2`,
      [req.params.id, req.auth.id],
    );
    const session = sessions[0];
    if (!session) return res.status(404).json({ error: 'Class session not found.' });
    if (input.data.action === 'join' &&
        (['completed', 'cancelled'].includes(session.status) || !['paid', 'completed'].includes(session.booking_status))) {
      return res.status(400).json({ error: 'This class is not available for attendance.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO attendance_records (session_id, user_id, joined_at, left_at)
       VALUES ($1, $2, CASE WHEN $3 = 'join' THEN now() ELSE NULL END,
                          CASE WHEN $3 = 'leave' THEN now() ELSE NULL END)
       ON CONFLICT (session_id, user_id) DO UPDATE SET
         joined_at = COALESCE(attendance_records.joined_at, EXCLUDED.joined_at),
         left_at = CASE WHEN $3 = 'leave' THEN now() ELSE attendance_records.left_at END
       RETURNING id, session_id, user_id, joined_at, left_at`,
      [req.params.id, req.auth.id, input.data.action],
    );
    return res.json({ attendance: rows[0] });
  } catch (error) {
    return next(error);
  }
});

studentRouter.post('/sessions/:id/meeting', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) {
      return res.status(404).json({ error: 'Class session not found.' });
    }
    const { rows } = await pool.query(
      `SELECT cs.id, cs.status
       FROM class_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       WHERE cs.id = $1 AND b.student_id = $2`,
      [req.params.id, req.auth.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Class session not found.' });
    if (['cancelled', 'completed'].includes(rows[0].status)) {
      return res.status(400).json({ error: 'This class is no longer available to join.' });
    }

    const { rows: timingRows } = await pool.query(
      `SELECT b.starts_at, b.ends_at FROM class_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       WHERE cs.id = $1 AND b.student_id = $2`,
      [req.params.id, req.auth.id],
    );
    const timing = timingRows[0];
    if (timing && Date.now() < new Date(timing.starts_at).getTime()) {
      const seconds = Math.max(1, Math.ceil((new Date(timing.starts_at).getTime() - Date.now()) / 1000));
      return res.status(403).json({
        error: `The session has not started yet. It starts in ${Math.floor(seconds / 60)}m ${seconds % 60}s.`,
      });
    }

    const result = await ensureSessionMeeting(req.params.id);
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

studentRouter.get('/chat/messages', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const room = req.query.room ?? 'global';
    if (room !== 'global') return res.status(400).json({ error: 'Only the global room is open to students.' });
    const { rows } = await pool.query(
      `SELECT m.id, m.sender_id, u.name AS sender_name, u.role AS sender_role, m.content, m.created_at
       FROM chat_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.room = $1 AND m.status = 'visible'
       ORDER BY m.created_at DESC LIMIT 100`,
      [room],
    );
    return res.json({ messages: rows.reverse() });
  } catch (error) {
    return next(error);
  }
});

const feedbackSchema = z.object({
  booking_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  testimony_text: z.string().max(600).default(''),
  allow_display: z.boolean().default(false),
});

studentRouter.post('/feedback', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);
    const { booking_id, rating, testimony_text, allow_display } = parsed.data;

    const { rows } = await pool.query(
      `SELECT id, teacher_id FROM bookings WHERE id = $1 AND student_id = $2 AND status = 'completed'`,
      [booking_id, req.auth.id],
    );
    const booking = rows[0];
    if (!booking) {
      return res.status(400).json({ error: 'Feedback can only be submitted for completed sessions.' });
    }

    const { rows: inserted } = await pool.query(
      `INSERT INTO feedback (booking_id, student_id, teacher_id, rating, testimony_text, allow_display)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, booking_id, rating, testimony_text, allow_display, created_at`,
      [booking_id, req.auth.id, booking.teacher_id, rating, testimony_text, allow_display],
    ).catch((error) => {
      if (error.code === '23505') {
        const duplicate = new Error('You have already submitted feedback for this session.');
        duplicate.status = 409;
        throw duplicate;
      }
      throw error;
    });
    await writeAudit(req, { actorId: req.auth.id, event: 'feedback_submitted', module: 'reports', targetId: inserted[0].id });
    return res.status(201).json({ feedback: inserted[0] });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
});

studentRouter.get('/feedback/mine', requireAuthenticatedUser, requireStudent, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, booking_id, rating, testimony_text, allow_display, created_at
       FROM feedback WHERE student_id = $1 ORDER BY created_at DESC`,
      [req.auth.id],
    );
    return res.json({ feedback: rows });
  } catch (error) {
    return next(error);
  }
});
