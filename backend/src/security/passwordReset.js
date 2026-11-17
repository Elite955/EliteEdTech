import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { pool } from '../db/pool.js';
import { writeAudit } from './audit.js';

function serviceUnavailable(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

export function isPasswordResetConfigured() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD && SMTP_FROM);
}

export async function sendPasswordResetEmail(req, { userId, email, actorId }) {
  if (!isPasswordResetConfigured()) {
    throw serviceUnavailable('Email password reset is not configured. Contact your platform owner.');
  }
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;

  await pool.query(
    `UPDATE admin_password_reset_tokens SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await pool.query(
    `INSERT INTO admin_password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '30 minutes')`,
    [userId, tokenHash],
  );

  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  const resetUrl = `${process.env.ADMIN_ORIGIN || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: 'Reset your EdTech account password',
      text: `Use this one-time link within 30 minutes to reset your password: ${resetUrl}\n\nIf you did not request this, ignore this email.`,
    });
  } catch (error) {
    console.error('Password reset email delivery failed:', error.message);
    await pool.query(
      'UPDATE admin_password_reset_tokens SET used_at = now() WHERE token_hash = $1',
      [tokenHash],
    );
    throw serviceUnavailable('The reset email could not be sent. Please contact your platform owner.');
  }

  await writeAudit(req, {
    actorId,
    event: 'password_reset_requested',
    module: 'security',
    targetId: userId,
    details: { initiatedByAdmin: actorId !== userId },
  });
}
