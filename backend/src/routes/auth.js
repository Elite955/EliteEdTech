import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { decryptField, encryptField } from '../security/fieldEncryption.js';
import { writeAudit } from '../security/audit.js';
import { requireAuthenticatedUser } from '../security/authMiddleware.js';
import { isPasswordResetConfigured, sendPasswordResetEmail } from '../security/passwordReset.js';
import { hashPassword, passwordHashNeedsUpgrade, verifyPassword } from '../security/passwords.js';
import { clearPortalCookies, setPortalCookie } from '../security/portals.js';

export const authRouter = Router();

// Mints a short-lived token for the Socket.IO handshake. The browser cannot send
// the httpOnly session cookie cross-site, so sockets authenticate with this.
authRouter.get('/socket-token', requireAuthenticatedUser, (req, res) => {
  const token = jwt.sign(
    { sub: req.auth.id, sid: req.auth.session_id, type: 'socket' },
    process.env.JWT_SECRET,
    { expiresIn: '2m' },
  );
  res.json({ token, portal: req.auth.session_portal });
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  code: z.string().regex(/^\d{6}$/).optional(),
  rememberMe: z.boolean().default(false),
  portal: z.enum(['student', 'teacher', 'admin']).default('student'),
});
const registerSchema = z.object({
  role: z.enum(['student', 'teacher']).default('student'),
  name: z.string().trim().min(2).max(80),
  email: z.string().email().max(254),
  phone: z.string().regex(/^[+0-9 ()-]{7,20}$/).optional(),
  password: z.string().min(12).max(128),
  age: z.number().int().min(1).max(120).optional(),
  grade: z.string().trim().max(40).optional(),
  hourly_rate: z.number().min(1).max(100000).optional(),
  subjects: z.array(z.string().trim().min(1).max(40)).min(1).max(8).optional(),
  bio: z.string().trim().max(600).optional(),
});
const codeSchema = z.object({
  challenge: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});
const resetRequestSchema = z.object({ email: z.string().email().max(254) });
const resetConfirmSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(128),
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: process.env.NODE_ENV === 'production' ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => [
    req.ip ? ipKeyGenerator(req.ip) : '',
    typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '',
    typeof req.body?.portal === 'string' ? req.body.portal : '',
  ].join(':'),
});

function issueChallenge(userId, type, rememberMe = false, portal) {
  return jwt.sign({ sub: userId, type, rememberMe, portal }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function studentShape(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'Student',
    roleCode: 'student',
    phone: user.phone ?? null,
    age: user.age ?? null,
    grade: user.grade ?? null,
  };
}

function teacherShape(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role_name ?? 'Teacher',
    roleCode: 'teacher',
    phone: user.phone ?? null,
  };
}

async function createSession(req, res, userId, rememberMe = false) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000));
  await pool.query(
    `UPDATE admin_sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [userId],
  );
  await pool.query(
    `INSERT INTO admin_sessions (id, user_id, expires_at, ip_address, user_agent, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [sessionId, userId, expiresAt, req.ip, req.get('user-agent') ?? null],
  );
  const token = jwt.sign({ sub: userId, sid: sessionId, type: 'session' }, process.env.JWT_SECRET, { expiresIn: rememberMe ? '30d' : '8h' });
  setPortalCookie(res, 'admin', token, expiresAt);
  await pool.query('UPDATE admin_profiles SET last_login_at = now() WHERE user_id = $1', [userId]);
  return sessionId;
}

async function createUserSession(req, res, userId, rememberMe = false, portal = 'student') {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000));
  await pool.query(
    `UPDATE user_sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [userId],
  );
  await pool.query(
    `INSERT INTO user_sessions (id, user_id, expires_at, ip_address, user_agent, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [sessionId, userId, expiresAt, req.ip, req.get('user-agent') ?? null],
  );
  const token = jwt.sign({ sub: userId, sid: sessionId, type: 'session' }, process.env.JWT_SECRET, { expiresIn: rememberMe ? '30d' : '8h' });
  setPortalCookie(res, portal, token, expiresAt);
  return sessionId;
}

async function permissionsFor(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT p.module, p.action
     FROM admin_profiles ap
     JOIN role_permissions rp ON rp.role_id = ap.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ap.user_id = $1`,
    [userId],
  );
  return rows;
}

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const input = registerSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Check the highlighted fields and try again.' });

    const { name, email, phone, password, age, grade, role, subjects, bio, hourly_rate } = input.data;
    if (role === 'student' && age === undefined) {
      return res.status(400).json({ error: 'Age is required for a student account.' });
    }
    if (role === 'teacher') {
      if (!phone) return res.status(400).json({ error: 'A phone number is required for a teacher account.' });
      if (!subjects?.length) return res.status(400).json({ error: 'Add at least one subject you teach.' });
      if (hourly_rate == null) return res.status(400).json({ error: 'An hourly rate is required for a teacher account.' });
    }
    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO users (role, name, email, phone, password_hash)
         VALUES ($1, $2, lower($3), $4, $5)
         RETURNING id, name, email, role`,
        [role, name, email, phone ?? null, passwordHash],
      );
      const user = rows[0];
      if (role === 'teacher') {
        await client.query(
          `INSERT INTO teacher_profiles (user_id, subjects, bio, hourly_rate, approved)
           VALUES ($1, $2, $3, $4, true)`,
          [user.id, subjects, bio ?? null, hourly_rate],
        );
      } else {
        await client.query('INSERT INTO student_profiles (user_id, age, grade) VALUES ($1, $2, $3)', [
          user.id,
          age,
          grade ?? null,
        ]);
      }
      await client.query('COMMIT');
      await writeAudit(req, {
        actorId: user.id,
        event: `${role}_registered`,
        module: role === 'teacher' ? 'teachers' : 'students',
        targetId: user.id,
      });
      return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role } });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: 'Enter a valid email address and password.' });
    }

    const email = input.data.email.toLowerCase();
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.password_hash, u.status, u.role,
              ap.mfa_secret_encrypted, ap.mfa_pending_secret_encrypted, ap.mfa_pending_expires_at,
               sp.mfa_secret_encrypted AS student_mfa_secret, sp.mfa_pending_secret_encrypted AS student_pending_secret,
               sp.mfa_pending_expires_at AS student_pending_expires_at, sp.age, sp.grade,
               tp.mfa_secret_encrypted AS teacher_mfa_secret, tp.mfa_pending_secret_encrypted AS teacher_pending_secret,
               tp.mfa_pending_expires_at AS teacher_pending_expires_at,
               r.code AS role_code, COALESCE(r.name, initcap(u.role)) AS role_name
        FROM users u
        LEFT JOIN admin_profiles ap ON ap.user_id = u.id
        LEFT JOIN admin_roles r ON r.id = ap.role_id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
        WHERE u.email = $1 AND u.role IN ('student', 'teacher', 'admin')`,
      [email],
    );
    const user = rows[0];
    if (!user || user.status !== 'active' || !(await verifyPassword(input.data.password, user.password_hash)) ||
        (user.role === 'admin' && !user.role_code)) {
      await writeAudit(req, { event: 'login_failed', module: 'security', details: { email } });
      return res.status(401).json({ error: 'Email or password is incorrect, or the account is unavailable.' });
    }

    if (input.data.portal !== user.role) {
      await writeAudit(req, {
        event: 'login_portal_mismatch',
        module: 'security',
        details: { email, portal: input.data.portal, accountRole: user.role },
      });
      return res.status(403).json({
        error: `This account signs in through the ${user.role} portal.`,
        portal: user.role,
      });
    }

    if (passwordHashNeedsUpgrade(user.password_hash)) {
      try {
        const upgraded = await hashPassword(input.data.password);
        await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [user.id, upgraded]);
      } catch {
        // Login still succeeds; the hash upgrades on the next successful sign-in.
      }
    }

    if (user.role === 'teacher') {
      if (user.teacher_mfa_secret) {
        if (!input.data.code) {
          return res.json({ requiresMfa: true, challenge: issueChallenge(user.id, 'mfa_login', input.data.rememberMe, 'teacher') });
        }
        const secret = decryptField(user.teacher_mfa_secret);
        if (!verifySync({ secret, token: input.data.code, epochTolerance: 30 }).valid) {
          await writeAudit(req, { actorId: user.id, event: 'mfa_failed', module: 'security' });
          return res.status(401).json({ error: 'The authenticator code is invalid.' });
        }
      } else {
        let secret = user.teacher_pending_secret;
        const expiry = user.teacher_pending_expires_at ? new Date(user.teacher_pending_expires_at) : null;
        if (!secret || !expiry || expiry <= new Date()) {
          secret = encryptField(generateSecret());
          await pool.query(
            `UPDATE teacher_profiles
             SET mfa_pending_secret_encrypted = $2, mfa_pending_expires_at = now() + interval '60 minutes'
             WHERE user_id = $1`,
            [user.id, secret],
          );
        }
        const rawSecret = decryptField(secret);
        return res.json({
          requiresMfaSetup: true,
          challenge: issueChallenge(user.id, 'mfa_setup', input.data.rememberMe, 'teacher'),
          otpAuthUrl: generateURI({ secret: rawSecret, issuer: 'Elite Platform', label: user.email }),
          accountName: user.email,
        });
      }

      const sessionId = await createUserSession(req, res, user.id, input.data.rememberMe, 'teacher');
      await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
      return res.json({ user: teacherShape(user), permissions: [] });
    }

    if (user.role === 'student') {
      if (user.student_mfa_secret) {
        if (!input.data.code) {
          return res.json({ requiresMfa: true, challenge: issueChallenge(user.id, 'mfa_login', input.data.rememberMe, 'student') });
        }
        const secret = decryptField(user.student_mfa_secret);
        if (!verifySync({ secret, token: input.data.code, epochTolerance: 30 }).valid) {
          await writeAudit(req, { actorId: user.id, event: 'mfa_failed', module: 'security' });
          return res.status(401).json({ error: 'The authenticator code is invalid.' });
        }
      } else {
        let secret = user.student_pending_secret;
        const expiry = user.student_pending_expires_at ? new Date(user.student_pending_expires_at) : null;
        if (!secret || !expiry || expiry <= new Date()) {
          secret = encryptField(generateSecret());
          await pool.query(
            `UPDATE student_profiles
             SET mfa_pending_secret_encrypted = $2, mfa_pending_expires_at = now() + interval '60 minutes'
             WHERE user_id = $1`,
            [user.id, secret],
          );
        }
        const rawSecret = decryptField(secret);
        return res.json({
          requiresMfaSetup: true,
          challenge: issueChallenge(user.id, 'mfa_setup', input.data.rememberMe, 'student'),
          otpAuthUrl: generateURI({ secret: rawSecret, issuer: 'Elite Platform', label: user.email }),
          accountName: user.email,
        });
      }

      const sessionId = await createUserSession(req, res, user.id, input.data.rememberMe, 'student');
      await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
      return res.json({
        user: studentShape(user),
        permissions: [],
      });
    }

    if (user.mfa_secret_encrypted) {
      if (!input.data.code) {
        return res.json({ requiresMfa: true, challenge: issueChallenge(user.id, 'mfa_login', input.data.rememberMe, 'admin') });
      }
      const secret = decryptField(user.mfa_secret_encrypted);
      if (!verifySync({ secret, token: input.data.code, epochTolerance: 30 }).valid) {
        await writeAudit(req, { actorId: user.id, event: 'mfa_failed', module: 'security' });
        return res.status(401).json({ error: 'The authenticator code is invalid.' });
      }
    } else {
      let secret = user.mfa_pending_secret_encrypted;
      const expiry = user.mfa_pending_expires_at ? new Date(user.mfa_pending_expires_at) : null;
      if (!secret || !expiry || expiry <= new Date()) {
        secret = encryptField(generateSecret());
        await pool.query(
          `UPDATE admin_profiles
           SET mfa_pending_secret_encrypted = $2, mfa_pending_expires_at = now() + interval '60 minutes'
           WHERE user_id = $1`,
          [user.id, secret],
        );
      }
      const rawSecret = decryptField(secret);
      return res.json({
        requiresMfaSetup: true,
        challenge: issueChallenge(user.id, 'mfa_setup', input.data.rememberMe, 'admin'),
        otpAuthUrl: generateURI({ secret: rawSecret, issuer: 'Elite Platform', label: user.email }),
        accountName: user.email,
      });
    }

    const sessionId = await createSession(req, res, user.id, input.data.rememberMe);
    await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role_name, roleCode: user.role_code },
      permissions: await permissionsFor(user.id),
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/mfa/confirm', authLimiter, async (req, res, next) => {
  try {
    const input = codeSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'A valid authenticator code is required.' });
    const claims = jwt.verify(input.data.challenge, process.env.JWT_SECRET);
    if (claims.type !== 'mfa_setup') return res.status(401).json({ error: 'The setup challenge is invalid or expired.' });
    if (claims.portal !== 'admin' && claims.portal !== 'student' && claims.portal !== 'teacher') {
      return res.status(401).json({ error: 'The setup challenge is invalid or expired.' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.status, u.role,
              r.code AS role_code, r.name AS role_name,
              ap.mfa_pending_secret_encrypted, ap.mfa_pending_expires_at,
               sp.mfa_pending_secret_encrypted AS student_pending_secret,
               sp.mfa_pending_expires_at AS student_pending_expires_at, sp.age, sp.grade,
               tp.mfa_pending_secret_encrypted AS teacher_pending_secret,
               tp.mfa_pending_expires_at AS teacher_pending_expires_at
        FROM users u
        LEFT JOIN admin_profiles ap ON ap.user_id = u.id
        LEFT JOIN admin_roles r ON r.id = ap.role_id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
        WHERE u.id = $1 AND u.role = $2`,
      [claims.sub, claims.portal],
    );
    const user = rows[0];
    const portal = claims.portal;
    const pendingSecret = portal === 'admin'
      ? user?.mfa_pending_secret_encrypted
      : portal === 'teacher'
        ? user?.teacher_pending_secret
        : user?.student_pending_secret;
    const pendingExpiry = portal === 'admin'
      ? user?.mfa_pending_expires_at
      : portal === 'teacher'
        ? user?.teacher_pending_expires_at
        : user?.student_pending_expires_at;
    if (!user || user.status !== 'active' || (portal === 'admin' && !user.role_code) || !pendingSecret ||
        !pendingExpiry || new Date(pendingExpiry) <= new Date()) {
      return res.status(401).json({ error: 'The MFA setup has expired. Sign in again to restart setup.' });
    }

    const secret = decryptField(pendingSecret);
    if (!verifySync({ secret, token: input.data.code, epochTolerance: 30 }).valid) {
      return res.status(401).json({ error: 'The authenticator code is invalid.' });
    }
    if (portal === 'admin') {
      await pool.query(
        `UPDATE admin_profiles SET mfa_secret_encrypted = mfa_pending_secret_encrypted,
          mfa_pending_secret_encrypted = NULL, mfa_pending_expires_at = NULL
         WHERE user_id = $1`,
        [user.id],
      );
    } else if (portal === 'teacher') {
      await pool.query(
        `UPDATE teacher_profiles SET mfa_secret_encrypted = mfa_pending_secret_encrypted,
          mfa_pending_secret_encrypted = NULL, mfa_pending_expires_at = NULL
         WHERE user_id = $1`,
        [user.id],
      );
    } else {
      await pool.query(
        `UPDATE student_profiles SET mfa_secret_encrypted = mfa_pending_secret_encrypted,
          mfa_pending_secret_encrypted = NULL, mfa_pending_expires_at = NULL
         WHERE user_id = $1`,
        [user.id],
      );
    }
    const sessionId = portal === 'admin'
      ? await createSession(req, res, user.id, claims.rememberMe)
      : await createUserSession(req, res, user.id, claims.rememberMe, portal);
    await writeAudit(req, { actorId: user.id, event: 'mfa_enrolled', module: 'security' });
    await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
    if (portal === 'admin') {
      return res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role_name, roleCode: user.role_code },
        permissions: await permissionsFor(user.id),
      });
    }
    if (portal === 'teacher') return res.json({ user: teacherShape(user), permissions: [] });
    return res.json({ user: studentShape(user), permissions: [] });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'The setup challenge is invalid or expired.' });
    }
    return next(error);
  }
});

authRouter.post('/mfa/verify', authLimiter, async (req, res, next) => {
  try {
    const input = codeSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'A valid authenticator code is required.' });
    const claims = jwt.verify(input.data.challenge, process.env.JWT_SECRET);
    if (claims.type !== 'mfa_login') return res.status(401).json({ error: 'The sign-in challenge is invalid or expired.' });
    if (claims.portal !== 'admin' && claims.portal !== 'student' && claims.portal !== 'teacher') {
      return res.status(401).json({ error: 'The sign-in challenge is invalid or expired.' });
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.status, u.role,
              r.code AS role_code, r.name AS role_name,
               ap.mfa_secret_encrypted, sp.mfa_secret_encrypted AS student_mfa_secret, sp.age, sp.grade,
               tp.mfa_secret_encrypted AS teacher_mfa_secret
        FROM users u
        LEFT JOIN admin_profiles ap ON ap.user_id = u.id
        LEFT JOIN admin_roles r ON r.id = ap.role_id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
        WHERE u.id = $1 AND u.role = $2`,
       [claims.sub, claims.portal],
     );
    const user = rows[0];
    const mfaSecret = user?.role === 'admin'
      ? user.mfa_secret_encrypted
      : user?.role === 'teacher'
        ? user.teacher_mfa_secret
        : user?.student_mfa_secret;
    const adminValid = user?.role === 'admin' && user.role_code && user.mfa_secret_encrypted;
    const roleValid = adminValid || (user?.role === 'teacher' && mfaSecret) || user?.role === 'student';
    if (!user || user.status !== 'active' || !roleValid || !mfaSecret ||
        !verifySync({ secret: decryptField(mfaSecret), token: input.data.code, epochTolerance: 30 }).valid) {
      await writeAudit(req, { actorId: user?.id ?? null, event: 'mfa_failed', module: 'security' });
      return res.status(401).json({ error: 'The authenticator code is invalid or the account is unavailable.' });
    }
    if (user.role === 'admin') {
      const sessionId = await createSession(req, res, user.id, claims.rememberMe);
      await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
      return res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role_name, roleCode: user.role_code },
        permissions: await permissionsFor(user.id),
      });
    }
    const sessionId = await createUserSession(req, res, user.id, claims.rememberMe, user.role);
    await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
    if (user.role === 'teacher') return res.json({ user: teacherShape(user), permissions: [] });
    return res.json({ user: studentShape(user), permissions: [] });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'The sign-in challenge is invalid or expired.' });
    }
    return next(error);
  }
});

authRouter.post('/password-reset/request', authLimiter, async (req, res, next) => {
  try {
    const input = resetRequestSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Enter a valid account email address.' });
    if (!isPasswordResetConfigured()) {
      return res.status(503).json({ error: 'Email password reset is not configured. Contact your platform owner.' });
    }
    const { rows } = await pool.query(
      `SELECT id, email FROM users WHERE lower(email) = $1 AND status = 'active'`,
      [input.data.email.toLowerCase()],
    );
    if (rows.length) {
      await sendPasswordResetEmail(req, { userId: rows[0].id, email: rows[0].email, actorId: rows[0].id });
    }
    return res.status(202).json({ message: 'If an active account matches that email, a password reset link will be sent.' });
  } catch (error) { return next(error); }
});

authRouter.post('/password-reset/confirm', authLimiter, async (req, res, next) => {
  try {
    const input = resetConfirmSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Provide a valid reset link and a password of at least 12 characters.' });
    const tokenHash = createHash('sha256').update(input.data.token).digest('hex');
    const passwordHash = await hashPassword(input.data.password);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT t.id AS token_id, u.id AS user_id
         FROM admin_password_reset_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
           AND u.role IN ('student', 'teacher', 'admin') AND u.status = 'active'
         FOR UPDATE OF t, u`,
        [tokenHash],
      );
      if (!rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This password reset link is invalid or expired.' });
      }
      await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [rows[0].user_id, passwordHash]);
      await client.query('UPDATE admin_password_reset_tokens SET used_at = now() WHERE id = $1', [rows[0].token_id]);
      await client.query('UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [rows[0].user_id]);
      await client.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [rows[0].user_id]);
      await client.query('COMMIT');
      await writeAudit(req, { actorId: rows[0].user_id, event: 'password_reset_completed', module: 'security' });
      return res.json({ message: 'Password updated. Sign in with your new password.' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } catch (error) { return next(error); }
});

authRouter.get('/me', requireAuthenticatedUser, async (req, res, next) => {
  try {
    if (req.auth.account_role === 'student') {
      const { rows } = await pool.query(
        `SELECT u.phone, sp.age, sp.grade
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1`,
        [req.auth.id],
      );
      const profile = rows[0] ?? {};
      return res.json({
        user: {
          id: req.auth.id,
          name: req.auth.name,
          email: req.auth.email,
          role: 'Student',
          roleCode: 'student',
          phone: profile.phone ?? null,
          age: profile.age ?? null,
          grade: profile.grade ?? null,
        },
        permissions: [],
      });
    }
    return res.json({
      user: {
        id: req.auth.id,
        name: req.auth.name,
        email: req.auth.email,
        role: req.auth.role_name,
        roleCode: req.auth.role_code,
      },
      permissions: req.auth.account_role === 'admin' ? await permissionsFor(req.auth.id) : [],
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/logout', requireAuthenticatedUser, async (req, res, next) => {
  try {
    if (req.auth.session_type === 'admin') {
      await pool.query('UPDATE admin_sessions SET revoked_at = now() WHERE id = $1', [req.auth.session_id]);
    } else {
      await pool.query('UPDATE user_sessions SET revoked_at = now() WHERE id = $1', [req.auth.session_id]);
    }
    await writeAudit(req, { event: 'logout', module: 'security', targetId: req.auth.session_id });
    clearPortalCookies(res, req.auth.session_portal ?? null);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
