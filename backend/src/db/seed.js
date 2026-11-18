import '../config.js';
import { hashPassword } from '../security/passwords.js';
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
  if (module === 'live_classes') return ['view', 'create', 'edit', 'approve', 'reject', 'export', 'manage'];
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

    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT role.id, permission.id
       FROM admin_roles role
       JOIN permissions permission ON permission.module IN ('students', 'teachers')
         AND permission.action IN ('view', 'edit')
       ON CONFLICT DO NOTHING`,
    );

    const passwordHash = await hashPassword(BOOTSTRAP_ADMIN_PASSWORD, client);
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

    const demoPassword = await hashPassword('Student@12345', client);
    const teacherPassword = await hashPassword('Teach@123456', client);
    const { rows: studentRows } = await client.query(
      `INSERT INTO users (role, name, email, phone, password_hash)
       VALUES ('student', 'Demo Student', 'student@edtech.test', '+919000000001', $1)
       ON CONFLICT (email) DO UPDATE SET role = 'student', name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, status = 'active', updated_at = now()
       RETURNING id`,
      [demoPassword],
    );
    await client.query(
      `INSERT INTO student_profiles (user_id, age, grade) VALUES ($1, 14, 'Grade 9')
       ON CONFLICT (user_id) DO UPDATE SET age = EXCLUDED.age, grade = EXCLUDED.grade`,
      [studentRows[0].id],
    );

    const demoTeachers = [
      { name: 'Ananya Rao', email: 'teacher1@edtech.test', phone: '+919000000002', subjects: ['Mathematics', 'Algebra'], bio: 'IIT-B graduate with 8 years of one-on-one maths coaching for school students.', rate: 450 },
      { name: 'Rohit Verma', email: 'teacher2@edtech.test', phone: '+919000000003', subjects: ['Science', 'Physics'], bio: 'Physics Olympiad mentor; loves making science intuitive for young learners.', rate: 500 },
    ];
    for (const teacher of demoTeachers) {
      const { rows: teacherUserRows } = await client.query(
        `INSERT INTO users (role, name, email, phone, password_hash)
         VALUES ('teacher', $1, lower($2), $3, $4)
         ON CONFLICT (email) DO UPDATE SET role = 'teacher', name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, status = 'active', updated_at = now()
         RETURNING id`,
        [teacher.name, teacher.email, teacher.phone, teacherPassword],
      );
      await client.query(
        `INSERT INTO teacher_profiles (user_id, subjects, bio, hourly_rate, approved)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (user_id) DO UPDATE SET subjects = EXCLUDED.subjects, bio = EXCLUDED.bio, hourly_rate = EXCLUDED.hourly_rate, approved = true`,
        [teacherUserRows[0].id, teacher.subjects, teacher.bio, teacher.rate],
      );
      for (const weekday of [1, 2, 3, 4, 5]) {
        for (const [start, end] of [['16:00', '18:00'], ['19:00', '21:00']]) {
          await client.query(
            `INSERT INTO teacher_availability (teacher_id, weekday, start_time, end_time)
             VALUES ($1, $2, $3::time, $4::time)
             ON CONFLICT (teacher_id, weekday, start_time, end_time) DO NOTHING`,
            [teacherUserRows[0].id, weekday, start, end],
          );
        }
      }
    }

    await client.query('COMMIT');
    console.log(`Super Admin bootstrap complete for ${BOOTSTRAP_ADMIN_EMAIL}.`);
    console.log('Demo accounts seeded: student@edtech.test / Student@12345, teacher1@edtech.test / Teach@123456.');
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
