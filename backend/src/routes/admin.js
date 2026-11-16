import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { writeAudit } from '../security/audit.js';
import { hasPermission, requireAdmin, requirePermission } from '../security/authMiddleware.js';

export const adminRouter = Router();

const userStatus = z.enum(['active', 'pending', 'suspended', 'deactivated']);
const personSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(40).optional().nullable(),
  age: z.number().int().min(1).max(120).optional().nullable(),
  grade: z.string().trim().max(80).optional().nullable(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  hourlyRate: z.number().nonnegative().max(100000).optional().nullable(),
});
const managedRecordSchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.string().trim().min(1).max(60).default('active'),
  data: z.record(z.string(), z.unknown()).default({}),
});
const allowedModules = new Set([
  'bookings', 'live_classes', 'chat_moderation', 'support', 'transactions', 'refunds', 'payouts',
  'revenue_analytics', 'recordings', 'attendance', 'reports', 'activity_logs', 'notifications',
  'templates', 'announcements', 'configuration', 'integrations', 'security', 'backups', 'maintenance',
]);

function validationError(res, error) {
  return res.status(400).json({ error: 'The submitted data is invalid.', details: error.issues });
}

function containsSensitiveField(value) {
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    /(secret|password|token|credential|api.?key)/i.test(key) || containsSensitiveField(child),
  );
}

async function listPeople(req, res, role) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const parameters = [role, `%${search}%`];
  let where = `u.role = $1 AND ($2 = '%%' OR u.name ILIKE $2 OR u.email ILIKE $2 OR COALESCE(u.phone, '') ILIKE $2 OR u.id::text ILIKE $2)`;
  if (userStatus.safeParse(status).success) {
    parameters.push(status);
    where += ` AND u.status = $${parameters.length}`;
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at,
            sp.age, sp.grade, tp.subjects, tp.hourly_rate, tp.approved
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE ${where}
     ORDER BY u.created_at DESC
     LIMIT 200`,
    parameters,
  );
  return res.json({ items: rows });
}

async function createPerson(req, res, role) {
  const input = personSchema.safeParse(req.body);
  if (!input.success) return validationError(res, input.error);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const data = input.data;
    const hash = await bcrypt.hash(data.password, 12);
    const { rows } = await client.query(
      `INSERT INTO users (role, name, email, password_hash, phone)
       VALUES ($1, $2, lower($3), $4, $5) RETURNING id, name, email, phone, status, created_at`,
      [role, data.name, data.email, hash, data.phone ?? null],
    );
    if (role === 'student') {
      await client.query('INSERT INTO student_profiles (user_id, age, grade) VALUES ($1, $2, $3)', [rows[0].id, data.age ?? null, data.grade ?? null]);
    } else {
      await client.query(
        'INSERT INTO teacher_profiles (user_id, subjects, hourly_rate) VALUES ($1, $2, $3)',
        [rows[0].id, data.subjects ?? [], data.hourlyRate ?? null],
      );
    }
    await client.query('COMMIT');
    await writeAudit(req, { event: `${role}_created`, module: `${role}s`, targetId: rows[0].id });
    return res.status(201).json({ item: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
    throw error;
  } finally {
    client.release();
  }
}

async function updatePerson(req, res, role) {
  const input = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().email().max(254).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    status: userStatus.optional(),
    age: z.number().int().min(1).max(120).nullable().optional(),
    grade: z.string().trim().max(80).nullable().optional(),
    subjects: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    hourlyRate: z.number().nonnegative().max(100000).nullable().optional(),
  }).safeParse(req.body);
  if (!input.success) return validationError(res, input.error);
  if (!Object.keys(input.data).length) return res.status(400).json({ error: 'Provide at least one field to update.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT id FROM users WHERE id = $1 AND role = $2 FOR UPDATE', [req.params.id, role]);
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Account not found.' });
    }
    const data = input.data;
    await client.query(
      `UPDATE users SET name = COALESCE($2, name), email = COALESCE(lower($3), email),
        phone = CASE WHEN $4::boolean THEN $5 ELSE phone END,
        status = COALESCE($6, status), updated_at = now()
       WHERE id = $1`,
      [req.params.id, data.name ?? null, data.email ?? null, Object.hasOwn(data, 'phone'), data.phone ?? null, data.status ?? null],
    );
    if (role === 'student' && (Object.hasOwn(data, 'age') || Object.hasOwn(data, 'grade'))) {
      await client.query(
        `INSERT INTO student_profiles (user_id, age, grade) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET age = COALESCE($2, student_profiles.age), grade = COALESCE($3, student_profiles.grade)`,
        [req.params.id, data.age ?? null, data.grade ?? null],
      );
    }
    if (role === 'teacher' && (Object.hasOwn(data, 'subjects') || Object.hasOwn(data, 'hourlyRate'))) {
      await client.query(
        `INSERT INTO teacher_profiles (user_id, subjects, hourly_rate) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET subjects = COALESCE($2, teacher_profiles.subjects), hourly_rate = COALESCE($3, teacher_profiles.hourly_rate)`,
        [req.params.id, data.subjects ?? null, data.hourlyRate ?? null],
      );
    }
    await client.query('COMMIT');
    await writeAudit(req, { event: `${role}_updated`, module: `${role}s`, targetId: req.params.id, details: { fields: Object.keys(data) } });
    return res.json({ message: 'Account updated.' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
    throw error;
  } finally {
    client.release();
  }
}

function csvCell(value) {
  const text = value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

adminRouter.get('/overview', requireAdmin, requirePermission('dashboard', 'view'), async (req, res, next) => {
  try {
    const [users, bookings, classes, payments, recent, userTrend, bookingTrend, revenueTrend] = await Promise.all([
      pool.query(`SELECT role, status, count(*)::int AS count FROM users WHERE role IN ('student', 'teacher', 'admin') GROUP BY role, status`),
      pool.query(`SELECT status, count(*)::int AS count FROM bookings GROUP BY status`),
      pool.query(`SELECT status, count(*)::int AS count FROM class_sessions GROUP BY status`),
      pool.query(`SELECT status, count(*)::int AS count, COALESCE(sum(amount), 0)::numeric AS amount FROM payments GROUP BY status`),
      pool.query(
        `SELECT id, event, module, target_id, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT 8`,
      ),
      pool.query(
        `SELECT date_trunc('month', created_at) AS month, role, count(*)::int AS count
         FROM users WHERE role IN ('student', 'teacher') AND created_at >= date_trunc('month', now()) - interval '5 months'
         GROUP BY 1, 2`,
      ),
      pool.query(
        `SELECT date_trunc('month', created_at) AS month, count(*)::int AS count
         FROM bookings WHERE created_at >= date_trunc('month', now()) - interval '5 months' GROUP BY 1`,
      ),
      pool.query(
        `SELECT date_trunc('month', created_at) AS month, COALESCE(sum(amount), 0)::numeric AS amount
         FROM payments WHERE status = 'succeeded' AND created_at >= date_trunc('month', now()) - interval '5 months' GROUP BY 1`,
      ),
    ]);
    const userCount = (role, status) => users.rows.find((row) => row.role === role && row.status === status)?.count ?? 0;
    const countStatus = (rows, status) => rows.find((row) => row.status === status)?.count ?? 0;
    const revenue = Number(payments.rows.find((row) => row.status === 'succeeded')?.amount ?? 0);
    const monthKey = (value) => new Date(value).toISOString().slice(0, 7);
    const trends = Array.from({ length: 6 }, (_value, index) => {
      const monthDate = new Date();
      monthDate.setDate(1);
      monthDate.setMonth(monthDate.getMonth() - (5 - index));
      const key = monthDate.toISOString().slice(0, 7);
      const userRows = userTrend.rows.filter((row) => monthKey(row.month) === key);
      return {
        month: new Intl.DateTimeFormat('en', { month: 'short' }).format(monthDate),
        students: userRows.find((row) => row.role === 'student')?.count ?? 0,
        teachers: userRows.find((row) => row.role === 'teacher')?.count ?? 0,
        bookings: bookingTrend.rows.find((row) => monthKey(row.month) === key)?.count ?? 0,
        revenue: Number(revenueTrend.rows.find((row) => monthKey(row.month) === key)?.amount ?? 0),
      };
    });
    return res.json({
      stats: {
        students: userCount('student', 'active'),
        totalStudents: users.rows.filter((row) => row.role === 'student').reduce((sum, row) => sum + row.count, 0),
        teachers: userCount('teacher', 'active'),
        totalTeachers: users.rows.filter((row) => row.role === 'teacher').reduce((sum, row) => sum + row.count, 0),
        administrators: users.rows.filter((row) => row.role === 'admin').reduce((sum, row) => sum + row.count, 0),
        bookings: bookings.rows.reduce((sum, row) => sum + row.count, 0),
        pendingBookings: countStatus(bookings.rows, 'pending'),
        completedClasses: countStatus(classes.rows, 'completed'),
        ongoingClasses: countStatus(classes.rows, 'ongoing'),
        cancelledClasses: countStatus(classes.rows, 'cancelled'),
        pendingPayments: countStatus(payments.rows, 'pending'),
        revenue,
      },
      recentActivity: recent.rows,
      trends,
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/search', requireAdmin, async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (query.length < 2) return res.json({ items: [] });
    const pattern = `%${query}%`;
    const items = [];
    for (const role of ['student', 'teacher']) {
      if (!(await hasPermission(req.auth, `${role}s`, 'view'))) continue;
      const { rows } = await pool.query(
        `SELECT id, name, email FROM users
         WHERE role = $1 AND (name ILIKE $2 OR email ILIKE $2 OR COALESCE(phone, '') ILIKE $2 OR id::text ILIKE $2)
         ORDER BY created_at DESC LIMIT 5`,
        [role, pattern],
      );
      items.push(...rows.map((row) => ({ id: row.id, label: row.name, subtitle: row.email, module: `${role}s`, path: `/${role}s` })));
    }
    if (await hasPermission(req.auth, 'bookings', 'view')) {
      const { rows } = await pool.query(
        `SELECT b.id, s.name || ' / ' || t.name AS label, b.status, b.id::text AS subtitle
         FROM bookings b JOIN users s ON s.id = b.student_id JOIN users t ON t.id = b.teacher_id
         WHERE b.id::text ILIKE $1 OR s.name ILIKE $1 OR t.name ILIKE $1
         ORDER BY b.created_at DESC LIMIT 5`,
        [pattern],
      );
      items.push(...rows.map((row) => ({ id: row.id, label: row.label, subtitle: `Booking · ${row.status}`, module: 'bookings', path: '/modules/bookings' })));
    }
    if (await hasPermission(req.auth, 'transactions', 'view')) {
      const { rows } = await pool.query(
        `SELECT id, provider_transaction_id, status, amount FROM payments
         WHERE COALESCE(provider_transaction_id, '') ILIKE $1 OR id::text ILIKE $1
         ORDER BY created_at DESC LIMIT 5`,
        [pattern],
      );
      items.push(...rows.map((row) => ({ id: row.id, label: row.provider_transaction_id || row.id, subtitle: `Payment · ${row.status} · ${row.amount}`, module: 'transactions', path: '/modules/transactions' })));
    }
    if (await hasPermission(req.auth, 'support', 'view')) {
      const { rows } = await pool.query(
        `SELECT id, subject, status FROM support_tickets
         WHERE subject ILIKE $1 OR description ILIKE $1 OR id::text ILIKE $1
         ORDER BY created_at DESC LIMIT 5`,
        [pattern],
      );
      items.push(...rows.map((row) => ({ id: row.id, label: row.subject, subtitle: `Support · ${row.status}`, module: 'support', path: '/modules/support' })));
    }
    return res.json({ items: items.slice(0, 20) });
  } catch (error) { return next(error); }
});

for (const role of ['student', 'teacher']) {
  const path = `/${role}s`;
  adminRouter.get(`${path}/export`, requireAdmin, requirePermission(`${role}s`, 'export'), async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.name, u.email, u.phone, u.status, u.created_at,
                sp.age, sp.grade, tp.subjects, tp.hourly_rate
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
         WHERE u.role = $1 ORDER BY u.created_at DESC`,
        [role],
      );
      const columns = role === 'student'
        ? ['name', 'email', 'phone', 'age', 'grade', 'status', 'created_at']
        : ['name', 'email', 'phone', 'subjects', 'hourly_rate', 'status', 'created_at'];
      const lines = [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${role}s.csv"`);
      return res.send(lines.join('\r\n'));
    } catch (error) { return next(error); }
  });
  adminRouter.get(path, requireAdmin, requirePermission(`${role}s`, 'view'), async (req, res, next) => {
    try { return await listPeople(req, res, role); } catch (error) { return next(error); }
  });
  adminRouter.post(path, requireAdmin, requirePermission(`${role}s`, 'create'), async (req, res, next) => {
    try { return await createPerson(req, res, role); } catch (error) { return next(error); }
  });
  adminRouter.patch(`${path}/bulk`, requireAdmin, requirePermission(`${role}s`, 'edit'), async (req, res, next) => {
    try {
      const input = z.object({
        ids: z.array(z.string().uuid()).min(1).max(100),
        status: z.enum(['active', 'suspended', 'deactivated']),
      }).safeParse(req.body);
      if (!input.success) return validationError(res, input.error);
      if (new Set(input.data.ids).size !== input.data.ids.length) {
        return res.status(400).json({ error: 'Duplicate account IDs are not allowed.' });
      }
      const { rows } = await pool.query(
        `UPDATE users SET status = $1, updated_at = now()
         WHERE id = ANY($2::uuid[]) AND role = $3 RETURNING id`,
        [input.data.status, input.data.ids, role],
      );
      await writeAudit(req, {
        event: `${role}_bulk_status_updated`,
        module: `${role}s`,
        details: { status: input.data.status, requestedCount: input.data.ids.length, updatedCount: rows.length },
      });
      return res.json({ message: `${rows.length} ${role} account(s) updated.`, updatedIds: rows.map((row) => row.id) });
    } catch (error) { return next(error); }
  });
  adminRouter.patch(`${path}/:id`, requireAdmin, requirePermission(`${role}s`, 'edit'), async (req, res, next) => {
    try { return await updatePerson(req, res, role); } catch (error) { return next(error); }
  });
}

adminRouter.get('/admins', requireAdmin, requirePermission('admins', 'view'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at,
              r.code AS role_code, r.name AS role_name, ap.last_login_at,
              EXISTS (SELECT 1 FROM admin_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS session_active
       FROM users u JOIN admin_profiles ap ON ap.user_id = u.id
       JOIN admin_roles r ON r.id = ap.role_id WHERE u.role = 'admin'
       ORDER BY u.created_at DESC LIMIT 200`,
    );
    return res.json({ items: rows });
  } catch (error) { return next(error); }
});

adminRouter.post('/admins', requireAdmin, requirePermission('admins', 'create'), async (req, res, next) => {
  try {
    if (req.auth.role_code !== 'super_admin') return res.status(403).json({ error: 'Only a Super Admin can create administrators.' });
    const input = z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().email().max(254),
      password: z.string().min(12).max(128),
      roleCode: z.string().min(2).max(60),
    }).safeParse(req.body);
    if (!input.success) return validationError(res, input.error);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: roleRows } = await client.query('SELECT id FROM admin_roles WHERE code = $1', [input.data.roleCode]);
      if (!roleRows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Select a valid administrator role.' });
      }
      const hash = await bcrypt.hash(input.data.password, 12);
      const { rows } = await client.query(
        `INSERT INTO users (role, name, email, password_hash) VALUES ('admin', $1, lower($2), $3)
         RETURNING id, name, email, status, created_at`,
        [input.data.name, input.data.email, hash],
      );
      await client.query('INSERT INTO admin_profiles (user_id, role_id) VALUES ($1, $2)', [rows[0].id, roleRows[0].id]);
      await client.query('COMMIT');
      await writeAudit(req, { event: 'admin_created', module: 'admins', targetId: rows[0].id, details: { roleCode: input.data.roleCode } });
      return res.status(201).json({ item: rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
      throw error;
    } finally { client.release(); }
  } catch (error) { return next(error); }
});

adminRouter.patch('/admins/:id', requireAdmin, requirePermission('admins', 'edit'), async (req, res, next) => {
  try {
    if (req.auth.role_code !== 'super_admin') {
      return res.status(403).json({ error: 'Only a Super Admin can manage administrator accounts.' });
    }
    const input = z.object({
      status: userStatus.optional(),
      roleCode: z.string().min(2).max(60).optional(),
      name: z.string().trim().min(1).max(120).optional(),
    }).safeParse(req.body);
    if (!input.success || !Object.keys(input.data ?? {}).length) return validationError(res, input.error ?? { issues: [] });
    if (req.params.id === req.auth.id && input.data.status && input.data.status !== 'active') {
      return res.status(400).json({ error: 'You cannot deactivate your own administrator account.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT u.id FROM users u WHERE u.id = $1 AND u.role = 'admin' FOR UPDATE`,
        [req.params.id],
      );
      if (!rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Administrator not found.' });
      }
      await client.query('UPDATE users SET status = COALESCE($2, status), name = COALESCE($3, name), updated_at = now() WHERE id = $1', [req.params.id, input.data.status ?? null, input.data.name ?? null]);
      if (input.data.roleCode) {
        const role = await client.query('SELECT id FROM admin_roles WHERE code = $1', [input.data.roleCode]);
        if (!role.rowCount) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Select a valid administrator role.' });
        }
        await client.query('UPDATE admin_profiles SET role_id = $2 WHERE user_id = $1', [req.params.id, role.rows[0].id]);
      }
      if (input.data.status && input.data.status !== 'active') {
        await client.query('UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.params.id]);
      }
      await client.query('COMMIT');
      await writeAudit(req, { event: 'admin_updated', module: 'admins', targetId: req.params.id, details: input.data });
      return res.json({ message: 'Administrator updated.' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) { return next(error); }
});

adminRouter.get('/admins/:id/sessions', requireAdmin, requirePermission('admins', 'view'), async (req, res, next) => {
  try {
    if (req.auth.role_code !== 'super_admin') return res.status(403).json({ error: 'Only a Super Admin can manage administrator sessions.' });
    const account = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND role = 'admin'`, [req.params.id]);
    if (!account.rowCount) return res.status(404).json({ error: 'Administrator not found.' });
    const { rows } = await pool.query(
      `SELECT id, created_at, expires_at, revoked_at, ip_address, user_agent
       FROM admin_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id],
    );
    return res.json({ items: rows });
  } catch (error) { return next(error); }
});

adminRouter.post('/admins/:id/revoke-sessions', requireAdmin, requirePermission('admins', 'manage'), async (req, res, next) => {
  try {
    if (req.auth.role_code !== 'super_admin') return res.status(403).json({ error: 'Only a Super Admin can revoke administrator sessions.' });
    const account = await pool.query(`SELECT 1 FROM users WHERE id = $1 AND role = 'admin'`, [req.params.id]);
    if (!account.rowCount) return res.status(404).json({ error: 'Administrator not found.' });
    const result = await pool.query(
      `UPDATE admin_sessions SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [req.params.id],
    );
    await writeAudit(req, { event: 'admin_sessions_revoked', module: 'admins', targetId: req.params.id, details: { revokedCount: result.rowCount } });
    return res.json({ message: `${result.rowCount} active session(s) revoked.` });
  } catch (error) { return next(error); }
});

adminRouter.get('/roles', requireAdmin, requirePermission('roles', 'view'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.code, r.name, r.description, r.is_system,
              COALESCE(jsonb_agg(jsonb_build_object('module', p.module, 'action', p.action))
                FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS permissions
       FROM admin_roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       GROUP BY r.id ORDER BY r.is_system DESC, r.name`,
    );
    return res.json({ items: rows });
  } catch (error) { return next(error); }
});

adminRouter.get('/permissions', requireAdmin, requirePermission('roles', 'view'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT module, action FROM permissions ORDER BY module, action');
    return res.json({ items: rows });
  } catch (error) { return next(error); }
});

adminRouter.post('/roles', requireAdmin, requirePermission('roles', 'manage'), async (req, res, next) => {
  try {
    const input = z.object({ code: z.string().regex(/^[a-z][a-z0-9_]{2,59}$/), name: z.string().trim().min(1).max(100), description: z.string().max(500).default('') }).safeParse(req.body);
    if (!input.success) return validationError(res, input.error);
    const { rows } = await pool.query(
      `INSERT INTO admin_roles (code, name, description) VALUES ($1, $2, $3) RETURNING id, code, name, description, is_system`,
      [input.data.code, input.data.name, input.data.description],
    );
    await writeAudit(req, { event: 'role_created', module: 'roles', targetId: rows[0].id });
    return res.status(201).json({ item: rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That role code already exists.' });
    return next(error);
  }
});

adminRouter.put('/roles/:id/permissions', requireAdmin, requirePermission('roles', 'manage'), async (req, res, next) => {
  try {
    const input = z.object({ permissions: z.array(z.object({ module: z.string().min(1).max(80), action: z.string().min(1).max(20) })).max(300) }).safeParse(req.body);
    if (!input.success) return validationError(res, input.error);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const role = await client.query('SELECT id, code FROM admin_roles WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!role.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Role not found.' });
      }
      if (role.rows[0].code === 'super_admin') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'The Super Admin role must retain its full access.' });
      }
      const permissionIds = [];
      for (const permission of input.data.permissions) {
        const found = await client.query('SELECT id FROM permissions WHERE module = $1 AND action = $2', [permission.module, permission.action]);
        if (!found.rowCount) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'One or more selected permissions are not valid.' });
        }
        permissionIds.push(found.rows[0].id);
      }
      if (new Set(permissionIds).size !== permissionIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Duplicate permissions are not allowed.' });
      }
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [req.params.id]);
      for (const permissionId of permissionIds) {
        await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [req.params.id, permissionId]);
      }
      await client.query('COMMIT');
      await writeAudit(req, { event: 'role_permissions_updated', module: 'roles', targetId: req.params.id, details: { permissionCount: permissionIds.length } });
      return res.json({ message: 'Role permissions updated.' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) { return next(error); }
});

async function moduleRows(module) {
  switch (module) {
    case 'bookings':
      return (await pool.query(
        `SELECT b.id, s.name || ' / ' || t.name AS title, b.status, b.created_at,
          jsonb_build_object('student', s.name, 'teacher', t.name, 'startsAt', b.starts_at, 'endsAt', b.ends_at, 'amount', b.amount) AS data
         FROM bookings b JOIN users s ON s.id = b.student_id JOIN users t ON t.id = b.teacher_id
         ORDER BY b.starts_at DESC LIMIT 200`,
      )).rows;
    case 'live_classes':
      return (await pool.query(
        `SELECT cs.id, b.id::text AS title, cs.status, cs.created_at,
          jsonb_build_object('meetingProvider', cs.meeting_provider, 'startedAt', cs.started_at, 'endedAt', cs.ended_at, 'recordingConsent', cs.recording_consent) AS data
         FROM class_sessions cs JOIN bookings b ON b.id = cs.booking_id
         ORDER BY cs.created_at DESC LIMIT 200`,
      )).rows;
    case 'chat_moderation':
      return (await pool.query(
        `SELECT m.id, left(m.content, 120) AS title, m.status, m.created_at,
          jsonb_build_object('sender', u.name, 'room', m.room, 'reported', m.reported, 'content', m.content) AS data
         FROM chat_messages m JOIN users u ON u.id = m.sender_id
         ORDER BY m.created_at DESC LIMIT 200`,
      )).rows;
    case 'support':
      return (await pool.query(
        `SELECT t.id, t.subject AS title, t.status, t.created_at,
          jsonb_build_object('priority', t.priority, 'description', t.description, 'userId', t.user_id, 'assignedTo', t.assigned_to) AS data
         FROM support_tickets t ORDER BY t.created_at DESC LIMIT 200`,
      )).rows;
    case 'transactions':
    case 'refunds':
      return (await pool.query(
        `SELECT p.id, COALESCE(p.provider_transaction_id, p.id::text) AS title, p.status, p.created_at,
          jsonb_build_object('provider', p.provider, 'amount', p.amount, 'bookingId', p.booking_id, 'studentId', p.student_id) AS data
         FROM payments p ${module === 'refunds' ? "WHERE p.status = 'refunded'" : ''}
         ORDER BY p.created_at DESC LIMIT 200`,
      )).rows;
    case 'revenue_analytics':
      return (await pool.query(
        `SELECT date_trunc('month', created_at)::text AS id,
          to_char(date_trunc('month', created_at), 'Mon YYYY') AS title,
          'succeeded' AS status,
          max(created_at) AS created_at,
          jsonb_build_object(
            'successfulAmount', COALESCE(sum(amount) FILTER (WHERE status = 'succeeded'), 0),
            'successfulTransactions', count(*) FILTER (WHERE status = 'succeeded'),
            'failedTransactions', count(*) FILTER (WHERE status = 'failed'),
            'pendingTransactions', count(*) FILTER (WHERE status = 'pending')
          ) AS data
         FROM payments WHERE created_at >= date_trunc('month', now()) - interval '11 months'
         GROUP BY date_trunc('month', created_at) ORDER BY date_trunc('month', created_at) DESC`,
      )).rows;
    case 'recordings':
      return (await pool.query(
        `SELECT id, booking_id::text AS title, status, created_at,
          jsonb_build_object('recordingUrl', recording_url, 'recordingConsent', recording_consent) AS data
         FROM class_sessions WHERE recording_consent = true AND recording_url IS NOT NULL
         ORDER BY created_at DESC LIMIT 200`,
      )).rows;
    case 'activity_logs':
    case 'security':
      return (await pool.query(
        `SELECT id, event AS title, module AS status, created_at,
          jsonb_build_object('actorId', actor_id, 'targetId', target_id, 'details', details) AS data
         FROM audit_logs ORDER BY created_at DESC LIMIT 200`,
      )).rows;
    case 'notifications':
      return (await pool.query(
        `SELECT id, subject AS title, status, created_at,
          jsonb_build_object('channel', channel, 'recipientId', recipient_id, 'providerId', provider_id) AS data
         FROM notifications ORDER BY created_at DESC LIMIT 200`,
      )).rows;
    case 'attendance':
      return (await pool.query(
        `SELECT a.id, u.name AS title, 'recorded' AS status, a.created_at,
          jsonb_build_object('sessionId', a.session_id, 'joinedAt', a.joined_at, 'leftAt', a.left_at) AS data
         FROM attendance_records a JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC LIMIT 200`,
      )).rows;
    case 'integrations':
      return [
        { id: 'database', title: 'PostgreSQL', status: process.env.DATABASE_URL ? 'credentials_present' : 'missing_credentials', created_at: new Date().toISOString(), data: { provider: 'PostgreSQL', credentialsPresent: Boolean(process.env.DATABASE_URL) } },
        { id: 'payments', title: 'Razorpay test mode', status: process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? 'credentials_present' : 'missing_credentials', created_at: new Date().toISOString(), data: { provider: 'Razorpay', mode: 'Test credentials only', credentialsPresent: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET), capabilities: 'Payment actions are not wired to the provider yet.' } },
        { id: 'zoom', title: 'Zoom meetings', status: process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET ? 'credentials_present' : 'missing_credentials', created_at: new Date().toISOString(), data: { provider: 'Zoom', credentialsPresent: Boolean(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET), capabilities: 'Meeting creation is not wired to the provider yet.' } },
        { id: 'email', title: 'Nodemailer SMTP', status: process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD ? 'credentials_present' : 'missing_credentials', created_at: new Date().toISOString(), data: { provider: 'Nodemailer', credentialsPresent: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD), capabilities: 'Password reset email is implemented; bulk notifications are not.' } },
        { id: 'whatsapp', title: 'Twilio WhatsApp sandbox', status: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'credentials_present' : 'missing_credentials', created_at: new Date().toISOString(), data: { provider: 'Twilio sandbox', credentialsPresent: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN), capabilities: 'Outbound messaging is not wired to the provider yet.' } },
      ];
    case 'configuration':
    case 'maintenance':
      return (await pool.query(
        `SELECT key AS id, replace(initcap(replace(key, '_', ' ')), ' ', ' ') AS title,
          'configured' AS status, updated_at AS created_at, jsonb_build_object('value', value) AS data
         FROM platform_settings
         WHERE ($1 = 'configuration' OR key IN ('maintenance_mode', 'maintenance_message'))
         ORDER BY key`,
        [module],
      )).rows;
    default:
      return (await pool.query(
        `SELECT id, title, status, created_at, data
         FROM managed_records WHERE module = $1 ORDER BY created_at DESC LIMIT 200`,
        [module],
      )).rows.map((row) => ({ ...row, data: redactSensitiveData(row.data) }));
  }
}

function redactSensitiveData(value) {
  if (Array.isArray(value)) return value.map(redactSensitiveData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(secret|password|token|credential|api.?key)/i.test(key))
    .map(([key, child]) => [key, redactSensitiveData(child)]));
}

adminRouter.get('/modules/:module', requireAdmin, async (req, res, next) => {
  try {
    const { module } = req.params;
    if (!allowedModules.has(module)) return res.status(404).json({ error: 'Admin module not found.' });
    if (!(await hasPermission(req.auth, module, 'view'))) return res.status(403).json({ error: 'You do not have permission to view this module.' });
    return res.json({ items: await moduleRows(module) });
  } catch (error) { return next(error); }
});

adminRouter.post('/modules/:module', requireAdmin, async (req, res, next) => {
  try {
    const { module } = req.params;
    if (!allowedModules.has(module)) return res.status(404).json({ error: 'Admin module not found.' });
    if (!(await hasPermission(req.auth, module, 'create'))) return res.status(403).json({ error: 'You do not have permission to create records in this module.' });
    if (!['support', 'templates', 'announcements', 'reports'].includes(module)) {
      return res.status(405).json({ error: 'Records in this module are created by platform workflows, not manually.' });
    }
    const input = managedRecordSchema.safeParse(req.body);
    if (!input.success) return validationError(res, input.error);
    if (containsSensitiveField(input.data.data)) {
      return res.status(400).json({ error: 'Do not store secrets or credentials in administrative records.' });
    }
    if (module === 'support') {
      const { rows } = await pool.query(
        `INSERT INTO support_tickets (subject, description, priority)
         VALUES ($1, $2, 'normal')
         RETURNING id, subject AS title, status, created_at`,
        [input.data.title, typeof input.data.data.description === 'string' ? input.data.data.description : ''],
      );
      await writeAudit(req, { event: 'support_ticket_created', module, targetId: rows[0].id });
      return res.status(201).json({ item: rows[0] });
    }
    const { rows } = await pool.query(
      `INSERT INTO managed_records (module, title, status, data, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, title, status, created_at, data`,
      [module, input.data.title, input.data.status, input.data.data, req.auth.id],
    );
    await writeAudit(req, { event: 'record_created', module, targetId: rows[0].id });
    return res.status(201).json({ item: rows[0] });
  } catch (error) { return next(error); }
});

adminRouter.patch('/modules/:module/:id', requireAdmin, async (req, res, next) => {
  try {
    const { module } = req.params;
    if (!allowedModules.has(module)) return res.status(404).json({ error: 'Admin module not found.' });
    const action = ['chat_moderation', 'live_classes', 'configuration', 'maintenance'].includes(module) ? 'manage' : 'edit';
    if (!(await hasPermission(req.auth, module, action))) return res.status(403).json({ error: 'You do not have permission to modify records in this module.' });
    const input = z.object({ status: z.string().trim().min(1).max(60).optional(), title: z.string().trim().min(1).max(200).optional(), data: z.record(z.string(), z.unknown()).optional() }).safeParse(req.body);
    if (!input.success || !Object.keys(input.data ?? {}).length) return validationError(res, input.error ?? { issues: [] });
    if (input.data.data && containsSensitiveField(input.data.data)) {
      return res.status(400).json({ error: 'Do not store secrets or credentials in administrative records.' });
    }

    let result;
    if (module === 'configuration' || module === 'maintenance') {
      const settings = {
        platform_name: z.string().trim().min(1).max(100),
        currency: z.string().regex(/^[A-Z]{3}$/),
        platform_commission_percent: z.number().min(0).max(100),
        cancellation_window_hours: z.number().int().min(0).max(720),
        maintenance_mode: z.boolean(),
        maintenance_message: z.string().max(500),
      };
      const allowedKeys = module === 'maintenance'
        ? new Set(['maintenance_mode', 'maintenance_message'])
        : new Set(Object.keys(settings));
      const schema = settings[req.params.id];
      if (!allowedKeys.has(req.params.id) || !schema) {
        return res.status(404).json({ error: 'Platform setting not found.' });
      }
      const parsed = schema.safeParse(input.data.data?.value);
      if (!parsed.success) return validationError(res, parsed.error);
      result = await pool.query(
        `UPDATE platform_settings SET value = $2, updated_by = $3, updated_at = now()
         WHERE key = $1 RETURNING key`,
        [req.params.id, JSON.stringify(parsed.data), req.auth.id],
      );
    } else if (module === 'bookings') {
      if (input.data.status && !['pending', 'approved', 'rejected', 'paid', 'completed', 'cancelled'].includes(input.data.status)) {
        return res.status(400).json({ error: 'Select a valid booking status.' });
      }
      result = await pool.query('UPDATE bookings SET status = COALESCE($2, status) WHERE id = $1 RETURNING id', [req.params.id, input.data.status ?? null]);
    } else if (module === 'live_classes') {
      if (!['scheduled', 'ongoing', 'completed', 'cancelled'].includes(input.data.status ?? '')) {
        return res.status(400).json({ error: 'Select a valid class status.' });
      }
      result = await pool.query('UPDATE class_sessions SET status = $2 WHERE id = $1 RETURNING id', [req.params.id, input.data.status]);
    } else if (module === 'chat_moderation') {
      if (!['visible', 'hidden', 'deleted'].includes(input.data.status ?? '')) {
        return res.status(400).json({ error: 'Select a valid moderation status.' });
      }
      result = await pool.query(
        `UPDATE chat_messages SET status = $2, moderated_by = $3, moderated_at = now() WHERE id = $1 RETURNING id`,
        [req.params.id, input.data.status, req.auth.id],
      );
    } else if (module === 'support') {
      const fields = z.object({
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
      }).safeParse(input.data);
      if (!fields.success) return validationError(res, fields.error);
      result = await pool.query(
        `UPDATE support_tickets SET status = COALESCE($2, status), priority = COALESCE($3, priority),
          assigned_to = CASE WHEN $4::boolean THEN $5::uuid ELSE assigned_to END, updated_at = now()
         WHERE id = $1 RETURNING id`,
        [req.params.id, fields.data.status ?? null, fields.data.priority ?? null, Object.hasOwn(fields.data, 'assignedTo'), fields.data.assignedTo ?? null],
      );
    } else {
      result = await pool.query(
        `UPDATE managed_records SET title = COALESCE($3, title), status = COALESCE($4, status),
          data = COALESCE($5, data), updated_at = now()
         WHERE id = $1 AND module = $2 RETURNING id`,
        [req.params.id, module, input.data.title ?? null, input.data.status ?? null, input.data.data ?? null],
      );
    }
    if (!result.rowCount) return res.status(404).json({ error: 'Record not found.' });
    await writeAudit(req, { event: 'record_updated', module, targetId: req.params.id, details: input.data });
    return res.json({ message: 'Record updated.' });
  } catch (error) { return next(error); }
});
