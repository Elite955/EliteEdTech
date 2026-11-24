import '../src/config.js';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/security/passwords.js';
import { pool } from '../src/db/pool.js';

// Generates fresh, strong passwords and upserts one demo account per role.
// Requires admin_roles/permissions to exist first: run `npm run db:seed`.
const password = () => randomBytes(24).toString('base64url');

const legacyEmails = ['student@edtech.test', 'teacher1@edtech.test', 'teacher2@edtech.test'];

const accounts = [
  { role: 'admin', name: 'Elite Administrator', email: 'admin@elite.test', phone: null },
  { role: 'student', name: 'Demo Student', email: 'student@elite.test', phone: '+919000000001' },
  { role: 'teacher', name: 'Ananya Rao', email: 'teacher@elite.test', phone: '+919000000002' },
].map((account) => ({ ...account, password: password() }));

async function upsertUser(account) {
  const passwordHash = await hashPassword(account.password);
  const { rows } = await pool.query(
    `INSERT INTO users (role, name, email, phone, password_hash, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (email) DO UPDATE
       SET role = EXCLUDED.role,
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           password_hash = EXCLUDED.password_hash,
           status = 'active',
           updated_at = now()
     RETURNING id`,
    [account.role, account.name, account.email, account.phone, passwordHash],
  );
  return rows[0].id;
}

const { rows: superAdmin } = await pool.query(`SELECT id FROM admin_roles WHERE code = 'super_admin'`);
if (!superAdmin.length) {
  console.error('admin_roles is empty. Run `npm run db:seed` first, then retry.');
  await pool.end();
  process.exit(1);
}

for (const account of accounts) {
  const userId = await upsertUser(account);

  if (account.role === 'admin') {
    await pool.query(
      `INSERT INTO admin_profiles (user_id, role_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [userId, superAdmin[0].id],
    );
  }

  if (account.role === 'student') {
    await pool.query(
      `INSERT INTO student_profiles (user_id, age, grade) VALUES ($1, 14, 'Grade 9')
       ON CONFLICT (user_id) DO UPDATE SET age = EXCLUDED.age, grade = EXCLUDED.grade`,
      [userId],
    );
  }

  if (account.role === 'teacher') {
    await pool.query(
      `INSERT INTO teacher_profiles (user_id, subjects, bio, hourly_rate, approved)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (user_id) DO UPDATE
         SET subjects = EXCLUDED.subjects, bio = EXCLUDED.bio,
             hourly_rate = EXCLUDED.hourly_rate, approved = true`,
      [userId, ['Mathematics', 'Algebra'], 'IIT-B graduate with 8 years of one-on-one maths coaching.', 450],
    );
    for (const weekday of [1, 2, 3, 4, 5]) {
      for (const [start, end] of [['16:00', '18:00'], ['19:00', '21:00']]) {
        await pool.query(
          `INSERT INTO teacher_availability (teacher_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3::time, $4::time)
           ON CONFLICT (teacher_id, weekday, start_time, end_time) DO NOTHING`,
          [userId, weekday, start, end],
        );
      }
    }
  }
}

try {
  const { rowCount } = await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [legacyEmails]);
  if (rowCount) console.log(`Removed ${rowCount} legacy demo account(s).`);
} catch (error) {
  console.warn('Could not remove legacy demo accounts (they may have bookings):', error.message);
}

console.log('\nDEMO ACCOUNTS\n');
for (const account of accounts) {
  console.log(`${account.role.padEnd(8)} ${account.email.padEnd(22)} ${account.password}`);
}
console.log('\nPasswords are shown once. Store them safely.\n');

await pool.end();
