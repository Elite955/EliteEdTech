import '../config.js';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const modules = [
  'dashboard', 'students', 'teachers', 'admins', 'roles', 'bookings', 'live_classes',
  'chat_moderation', 'support', 'transactions', 'refunds', 'payouts', 'revenue_analytics',
  'recordings', 'attendance', 'reports', 'activity_logs', 'notifications', 'templates', 'announcements',
  'configuration', 'integrations', 'security', 'backups', 'maintenance',
];
const actions = ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'export', 'manage'];
const roleDefinitions = [
  { code: 'super_admin', name: 'Super Admin', description: 'Full platform administration.', system: true, grants: '*' },
  { code: 'operations_admin', name: 'Operations Admin', description: 'User, booking, class, and attendance operations.', system: true, grants: ['dashboard', 'students', 'teachers', 'bookings', 'live_classes', 'attendance', 'support'] },
  { code: 'finance_admin', name: 'Finance Admin', description: 'Payment, refund, payout, and revenue operations.', system: true, grants: ['dashboard', 'transactions', 'refunds', 'payouts', 'revenue_analytics', 'reports'] },
  { code: 'support_admin', name: 'Support Admin', description: 'User assistance and support ticket operations.', system: true, grants: ['dashboard', 'students', 'teachers', 'bookings', 'support'] },
  { code: 'moderator', name: 'Moderator', description: 'Global chat moderation.', system: true, grants: ['dashboard', 'chat_moderation'] },
];

function actionsFor(role, module) {
  if (role.grants === '*') return actions;
  if (!role.grants.includes(module)) return [];
  if (role.code === 'finance_admin') return ['view', 'export', ...(module === 'refunds' || module === 'payouts' ? ['manage'] : [])];
  if (role.code === 'moderator') return ['view', 'edit', 'manage'];
  if (role.code === 'support_admin') return module === 'support' ? ['view', 'create', 'edit', 'manage'] : ['view'];
  if (module === 'dashboard') return ['view'];
  return ['view', 'create', 'edit', 'approve', 'reject', 'export'];
}

async function seed() {
  const { BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME } = process.env;
  if (!BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before seeding.');
  }
  if (BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const role of roleDefinitions) {
      await client.query(
        `INSERT INTO admin_roles (code, name, description, is_system)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
        [role.code, role.name, role.description, role.system],
      );
    }

    for (const module of modules) {
      for (const action of actions) {
        await client.query(
          `INSERT INTO permissions (module, action) VALUES ($1, $2)
           ON CONFLICT (module, action) DO NOTHING`,
          [module, action],
        );
      }
    }

    for (const role of roleDefinitions) {
      const { rows: roleRows } = await client.query('SELECT id FROM admin_roles WHERE code = $1', [role.code]);
      for (const module of modules) {
        for (const action of actionsFor(role, module)) {
          const { rows: permissionRows } = await client.query(
            'SELECT id FROM permissions WHERE module = $1 AND action = $2',
            [module, action],
          );
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [roleRows[0].id, permissionRows[0].id],
          );
        }
      }
    }

    const passwordHash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (role, name, email, password_hash)
       VALUES ('admin', $1, lower($2), $3)
       ON CONFLICT (email) DO UPDATE
         SET role = 'admin', name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, status = 'active', updated_at = now()
       RETURNING id`,
      [BOOTSTRAP_ADMIN_NAME || 'Platform Administrator', BOOTSTRAP_ADMIN_EMAIL, passwordHash],
    );
    const { rows: superAdminRows } = await client.query(`SELECT id FROM admin_roles WHERE code = 'super_admin'`);
    await client.query(
      `INSERT INTO admin_profiles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [userRows[0].id, superAdminRows[0].id],
    );
    await client.query('COMMIT');
    console.log(`Super Admin bootstrap complete for ${BOOTSTRAP_ADMIN_EMAIL}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await seed();
} catch (error) {
  console.error('Database seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
