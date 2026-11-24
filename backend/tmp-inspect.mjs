import './src/config.js';
import { pool } from './src/db/pool.js';

const [counts, refs, triggers, admins] = await Promise.all([
  pool.query(`SELECT role, count(*)::int AS n FROM users GROUP BY role ORDER BY role`),
  pool.query(`
    SELECT tc.table_name, tc.constraint_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND EXISTS (
        SELECT 1 FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints pk
          ON pk.constraint_name = kcu.constraint_name AND pk.constraint_schema = kcu.constraint_schema
        WHERE pk.constraint_type = 'PRIMARY KEY' AND kcu.table_name = 'users'
          AND kcu.column_name IN (
            SELECT ccu.column_name FROM information_schema.constraint_column_usage ccu
            WHERE ccu.constraint_name = tc.constraint_name
          )
      )
    ORDER BY tc.table_name`),
  pool.query(`SELECT event_object_table, trigger_name, action_timing, event_manipulation
              FROM information_schema.triggers WHERE trigger_schema='public'
              ORDER BY event_object_table, trigger_name`),
  pool.query(`SELECT u.id, u.email, u.role, r.code AS role_code
              FROM users u LEFT JOIN admin_profiles ap ON ap.user_id=u.id
              LEFT JOIN admin_roles r ON r.id=ap.role_id ORDER BY u.role, u.email`),
]);

console.log('USERS BY ROLE:', JSON.stringify(counts.rows));
console.log('FKs TO users:', JSON.stringify(refs.rows));
console.log('TRIGGERS:', JSON.stringify(triggers.rows));
console.log('ACCOUNTS:', JSON.stringify(admins.rows, null, 1));
await pool.end();
