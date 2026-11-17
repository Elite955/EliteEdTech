import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { decryptField, encryptField } from '../security/fieldEncryption.js';
import { writeAudit } from '../security/audit.js';
import { requireAuthenticatedUser } from '../security/authMiddleware.js';
import { isPasswordResetConfigured, sendPasswordResetEmail } from '../security/passwordReset.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
});
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  code: z.string().regex(/^\d{6}$/).optional(),
  rememberMe: z.boolean().default(false),
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

function issueChallenge(userId, type, rememberMe = false) {
  return jwt.sign({ sub: userId, type, rememberMe }, process.env.JWT_SECRET, { expiresIn: '5m' });
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
  res.clearCookie('admin_session', cookieOptions());
  res.cookie('edtech_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
  await pool.query('UPDATE admin_profiles SET last_login_at = now() WHERE user_id = $1', [userId]);
  return sessionId;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

async function createUserSession(req, res, userId, rememberMe = false) {
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
  res.clearCookie('admin_session', cookieOptions());
  res.cookie('edtech_session', token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
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

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const input = loginSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: 'Enter a valid email address and password.' });
    }

    const email = input.data.email.toLowerCase();
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.status, u.role,
              ap.mfa_secret_encrypted, ap.mfa_pending_secret_encrypted, ap.mfa_pending_expires_at,
              r.code AS role_code, COALESCE(r.name, initcap(u.role)) AS role_name
       FROM users u
       LEFT JOIN admin_profiles ap ON ap.user_id = u.id
       LEFT JOIN admin_roles r ON r.id = ap.role_id
       WHERE u.email = $1 AND u.role IN ('student', 'teacher', 'admin')`,
      [email],
    );
    const user = rows[0];
    if (!user || user.status !== 'active' || !(await bcrypt.compare(input.data.password, user.password_hash)) ||
        (user.role === 'admin' && !user.role_code)) {
      await writeAudit(req, { event: 'login_failed', module: 'security', details: { email } });
      return res.status(401).json({ error: 'Email or password is incorrect, or the account is unavailable.' });
    }

    if (user.role !== 'admin') {
      const sessionId = await createUserSession(req, res, user.id, input.data.rememberMe);
      await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
      return res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role_name, roleCode: user.role_code ?? user.role },
        permissions: [],
      });
    }

    if (user.mfa_secret_encrypted) {
      if (!input.data.code) {
        return res.json({ requiresMfa: true, challenge: issueChallenge(user.id, 'mfa_login', input.data.rememberMe) });
      }
      const secret = decryptField(user.mfa_secret_encrypted);
      if (!verifySync({ secret, token: input.data.code }).valid) {
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
           SET mfa_pending_secret_encrypted = $2, mfa_pending_expires_at = now() + interval '10 minutes'
           WHERE user_id = $1`,
          [user.id, secret],
        );
      }
      const rawSecret = decryptField(secret);
      return res.json({
        requiresMfaSetup: true,
        challenge: issueChallenge(user.id, 'mfa_setup', input.data.rememberMe),
        otpAuthUrl: generateURI({ secret: rawSecret, issuer: 'EdTech Platform', label: user.email }),
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

authRouter.post('/mfa/confirm', loginLimiter, async (req, res, next) => {
  try {
    const input = codeSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'A valid authenticator code is required.' });
    const claims = jwt.verify(input.data.challenge, process.env.JWT_SECRET);
    if (claims.type !== 'mfa_setup') return res.status(401).json({ error: 'The setup challenge is invalid or expired.' });

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.status, r.code AS role_code, r.name AS role_name,
              ap.mfa_pending_secret_encrypted, ap.mfa_pending_expires_at
       FROM users u JOIN admin_profiles ap ON ap.user_id = u.id
       JOIN admin_roles r ON r.id = ap.role_id
       WHERE u.id = $1 AND u.role = 'admin'`,
      [claims.sub],
    );
    const user = rows[0];
    if (!user || user.status !== 'active' || !user.mfa_pending_secret_encrypted ||
        !user.mfa_pending_expires_at || new Date(user.mfa_pending_expires_at) <= new Date()) {
      return res.status(401).json({ error: 'The MFA setup has expired. Sign in again to restart setup.' });
    }

    const secret = decryptField(user.mfa_pending_secret_encrypted);
    if (!verifySync({ secret, token: input.data.code }).valid) {
      return res.status(401).json({ error: 'The authenticator code is invalid.' });
    }
    await pool.query(
      `UPDATE admin_profiles SET mfa_secret_encrypted = mfa_pending_secret_encrypted,
        mfa_pending_secret_encrypted = NULL, mfa_pending_expires_at = NULL
       WHERE user_id = $1`,
      [user.id],
    );
    const sessionId = await createSession(req, res, user.id, claims.rememberMe);
    await writeAudit(req, { actorId: user.id, event: 'mfa_enrolled', module: 'security' });
    await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role_name, roleCode: user.role_code },
      permissions: await permissionsFor(user.id),
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'The setup challenge is invalid or expired.' });
    }
    return next(error);
  }
});

authRouter.post('/mfa/verify', loginLimiter, async (req, res, next) => {
  try {
    const input = codeSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'A valid authenticator code is required.' });
    const claims = jwt.verify(input.data.challenge, process.env.JWT_SECRET);
    if (claims.type !== 'mfa_login') return res.status(401).json({ error: 'The sign-in challenge is invalid or expired.' });
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.status, r.code AS role_code, r.name AS role_name,
              ap.mfa_secret_encrypted
       FROM users u JOIN admin_profiles ap ON ap.user_id = u.id
       JOIN admin_roles r ON r.id = ap.role_id
       WHERE u.id = $1 AND u.role = 'admin'`,
      [claims.sub],
    );
    const user = rows[0];
    if (!user || user.status !== 'active' || !user.mfa_secret_encrypted ||
        !verifySync({ secret: decryptField(user.mfa_secret_encrypted), token: input.data.code }).valid) {
      await writeAudit(req, { actorId: user?.id ?? null, event: 'mfa_failed', module: 'security' });
      return res.status(401).json({ error: 'The authenticator code is invalid or the account is unavailable.' });
    }
    const sessionId = await createSession(req, res, user.id, claims.rememberMe);
    await writeAudit(req, { actorId: user.id, event: 'login_succeeded', module: 'security', targetId: sessionId });
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role_name, roleCode: user.role_code },
      permissions: await permissionsFor(user.id),
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'The sign-in challenge is invalid or expired.' });
    }
    return next(error);
  }
});

authRouter.post('/password-reset/request', loginLimiter, async (req, res, next) => {
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

authRouter.post('/password-reset/confirm', loginLimiter, async (req, res, next) => {
  try {
    const input = resetConfirmSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Provide a valid reset link and a password of at least 12 characters.' });
    const tokenHash = createHash('sha256').update(input.data.token).digest('hex');
    const passwordHash = await bcrypt.hash(input.data.password, 12);
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
    res.clearCookie('edtech_session', cookieOptions());
    res.clearCookie('admin_session', cookieOptions());
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
