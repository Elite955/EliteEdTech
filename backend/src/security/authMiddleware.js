import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

async function touchSession(sessionType, sessionId, lastSeenAt) {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 60_000) return;
  const table = sessionType === 'admin' ? 'admin_sessions' : 'user_sessions';
  await pool.query(
    `UPDATE ${table} SET last_seen_at = now()
     WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()
       AND (last_seen_at IS NULL OR last_seen_at < now() - interval '1 minute')`,
    [sessionId],
  );
}

export async function requireAdmin(req, res, next) {
  const token = req.cookies.edtech_session ?? req.cookies.admin_session;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (claims.type !== 'session' || !claims.sid) {
      return res.status(401).json({ error: 'Session is invalid or expired.' });
    }

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.status, r.code AS role_code, r.name AS role_name,
              s.id AS session_id, s.last_seen_at
       FROM admin_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN admin_profiles ap ON ap.user_id = u.id
       JOIN admin_roles r ON r.id = ap.role_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND u.status = 'active' AND u.role = 'admin'`,
      [claims.sid, claims.sub],
    );

    if (!result.rowCount) {
      return res.status(401).json({ error: 'Session is invalid or expired.' });
    }

    req.auth = result.rows[0];
    await touchSession('admin', req.auth.session_id, req.auth.last_seen_at);
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session is invalid or expired.' });
    }
    return next(error);
  }
}

export async function requireAuthenticatedUser(req, res, next) {
  const token = req.cookies.edtech_session ?? req.cookies.admin_session;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (claims.type !== 'session' || !claims.sid) {
      return res.status(401).json({ error: 'Session is invalid or expired.' });
    }

    const adminSession = await pool.query(
      `SELECT u.id, u.name, u.email, u.status, u.role AS account_role,
              r.code AS role_code, r.name AS role_name, s.id AS session_id, s.last_seen_at
       FROM admin_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN admin_profiles ap ON ap.user_id = u.id
       JOIN admin_roles r ON r.id = ap.role_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND u.status = 'active' AND u.role = 'admin'`,
      [claims.sid, claims.sub],
    );

    if (adminSession.rowCount) {
      req.auth = { ...adminSession.rows[0], session_type: 'admin' };
      await touchSession('admin', req.auth.session_id, req.auth.last_seen_at);
      return next();
    }

    const userSession = await pool.query(
      `SELECT u.id, u.name, u.email, u.status, u.role AS account_role,
              u.role AS role_code, initcap(u.role) AS role_name, s.id AS session_id, s.last_seen_at
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND u.status = 'active' AND u.role IN ('student', 'teacher')`,
      [claims.sid, claims.sub],
    );

    if (!userSession.rowCount) {
      return res.status(401).json({ error: 'Session is invalid or expired.' });
    }
    req.auth = { ...userSession.rows[0], session_type: 'user' };
    await touchSession('user', req.auth.session_id, req.auth.last_seen_at);
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session is invalid or expired.' });
    }
    return next(error);
  }
}

export function requirePermission(module, action) {
  return async (req, res, next) => {
    try {
      if (await hasPermission(req.auth, module, action)) {
        return next();
      }
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    } catch (error) {
      return next(error);
    }
  };
}

export async function hasPermission(auth, module, action) {
  if (auth.role_code === 'super_admin') return true;
  const result = await pool.query(
    `SELECT 1
     FROM admin_profiles ap
     JOIN role_permissions rp ON rp.role_id = ap.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ap.user_id = $1 AND p.module = $2 AND p.action = $3`,
    [auth.id, module, action],
  );
  return result.rowCount > 0;
}
