import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(here, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { pool } = await import('../src/db/pool.js');
const { hashPassword } = await import('../src/security/passwords.js');
const { encryptField } = await import('../src/security/fieldEncryption.js');
const { generateSecret, generateURI } = await import('otplib');

const [email, password, name = 'Student', age = '16'] = process.argv.slice(2);
if (!email || !password || password.length < 12) {
  console.error('usage: node scripts/enroll-mfa.mjs <email> <password>=12+ [name] [age]');
  process.exit(1);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  let userId;
  const existing = await client.query(`SELECT id, role FROM users WHERE email = lower($1)`, [email]);
  if (existing.rows.length > 0) {
    if (existing.rows[0].role !== 'student') throw new Error('user exists with a non-student role');
    userId = existing.rows[0].id;
    await client.query(`UPDATE users SET status = 'active' WHERE id = $1`, [userId]);
    await client.query(
      `UPDATE student_profiles SET age = $2, mfa_pending_secret_encrypted = NULL, mfa_pending_expires_at = NULL WHERE user_id = $1`,
      [userId, Number(age)],
    );
    console.log(`existing student account re-enrolled: ${email}`);
  } else {
    const passwordHash = await hashPassword(password, client);
    const inserted = await client.query(
      `INSERT INTO users (role, name, email, password_hash) VALUES ('student', $1, lower($2), $3) RETURNING id`,
      [name, email, passwordHash],
    );
    userId = inserted.rows[0].id;
    await client.query(`INSERT INTO student_profiles (user_id, age) VALUES ($1, $2)`, [userId, Number(age)]);
    console.log(`new student account created: ${email}`);
  }
  const secret = generateSecret();
  await client.query(
    `UPDATE student_profiles SET mfa_secret_encrypted = $2, mfa_pending_secret_encrypted = NULL, mfa_pending_expires_at = NULL WHERE user_id = $1`,
    [userId, encryptField(secret)],
  );
  await client.query('COMMIT');
  console.log('');
  console.log(`email:    ${email.toLowerCase()}`);
  console.log(`password: ${password}`);
  console.log(`name:     ${name} / age ${age}`);
  console.log('');
  console.log(`otpauth URI: ${generateURI({ secret, issuer: 'EdTech Platform', label: email.toLowerCase() })}`);
  console.log(`manual-entry secret: ${secret}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
