import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';

const BCRYPT_HASH = /^\$2[abxy]\$/;

export async function hashPassword(password, client = pool) {
  const { rows } = await client.query("SELECT crypt($1, gen_salt('bf', 12)) AS hash", [password]);
  return rows[0].hash;
}

export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  try {
    const { rows } = await pool.query('SELECT crypt($1, $2) = $2 AS matches', [password, storedHash]);
    if (rows[0]?.matches === true) return true;
  } catch {
    if (!BCRYPT_HASH.test(storedHash)) return false;
  }
  if (BCRYPT_HASH.test(storedHash)) {
    try {
      return await bcrypt.compare(password, storedHash);
    } catch {
      return false;
    }
  }
  return false;
}

export function passwordHashNeedsUpgrade(storedHash) {
  return !/^\$2a\$12\$/.test(storedHash ?? '');
}
