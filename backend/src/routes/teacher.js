import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuthenticatedUser } from '../security/authMiddleware.js';
import { writeAudit } from '../security/audit.js';

export const teacherRouter = Router();

const IST_ZONE = 'Asia/Kolkata';

function requireTeacher(req, res, next) {
  if (req.auth.account_role !== 'teacher') {
    return res.status(403).json({ error: 'This area is available to teacher accounts only.' });
  }
  return next();
}

function bookingRowSql(alias = 'b') {
  return `${alias}.id, ${alias}.status, ${alias}.amount, ${alias}.created_at,
    to_char(${alias}.starts_at AT TIME ZONE '${IST_ZONE}', 'YYYY-MM-DD') AS date,
    to_char(${alias}.starts_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS start_time,
    to_char(${alias}.ends_at AT TIME ZONE '${IST_ZONE}', 'HH24:MI') AS end_time`;
}

teacherRouter.get('/profile', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.name, u.email, tp.subjects, tp.bio, tp.hourly_rate, tp.approved
       FROM users u JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE u.id = $1`,
      [req.auth.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher profile not found.' });
    const row = rows[0];
    return res.json({
      profile: {
        name: row.name,
        email: row.email,
        subjects: row.subjects ?? [],
        bio: row.bio,
        hourly_rate: row.hourly_rate === null ? null : Number(row.hourly_rate),
        approved: row.approved,
      },
    });
  } catch (error) {
    return next(error);
  }
});

teacherRouter.get('/bookings', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${bookingRowSql()}, s.id AS student_id, s.name AS student_name
       FROM bookings b JOIN users s ON s.id = b.student_id
       WHERE b.teacher_id = $1
       ORDER BY b.starts_at DESC`,
      [req.auth.id],
    );
    return res.json({
      bookings: rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
        student: { id: row.student_id, name: row.student_name },
      })),
    });
  } catch (error) {
    return next(error);
  }
});

const decisionSchema = z.object({ action: z.enum(['approve', 'reject']) });

teacherRouter.patch('/bookings/:id', requireAuthenticatedUser, requireTeacher, async (req, res, next) => {
  try {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Send action: approve or reject.' });
    const status = parsed.data.action === 'approve' ? 'approved' : 'rejected';
    const { rows } = await pool.query(
      `UPDATE bookings b SET status = $2
       WHERE b.id = $1 AND b.teacher_id = $3 AND b.status = 'pending'
       RETURNING ${bookingRowSql()}`,
      [req.params.id, status, req.auth.id],
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Only your own pending bookings can be decided.' });
    }
    await writeAudit(req, {
      actorId: req.auth.id,
      event: `booking_${parsed.data.action}d`,
      module: 'bookings',
      targetId: req.params.id,
    });
    return res.json({
      booking: {
        ...rows[0],
        amount: Number(rows[0].amount),
      },
    });
  } catch (error) {
    return next(error);
  }
});
