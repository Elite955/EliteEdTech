import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { resolveSessionToken } from './portals.js';

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

const ADMIN_SESSION_QUERY = `
  SELECT u.id, u.name, u.email, u.status, u.role AS account_role,
         r.code AS role_code, r.name AS role_name, s.id AS session_id, s.last_seen_at
  FROM admin_sessions s
  JOIN users u ON u.id = s.user_id
  JOIN admin_profiles ap ON ap.user_id = u.id
  JOIN admin_roles r ON r.id = ap.role_id
  WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL
    AND s.expires_at > now() AND u.status = 'active' AND u.role = 'admin'`;

const USER_SESSION_QUERY = `
  SELECT u.id, u.name, u.email, u.status, u.role AS account_role,
         u.role AS role_code, initcap(u.role) AS role_name, s.id AS session_id, s.last_seen_at
  FROM user_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL
    AND s.expires_at > now() AND u.status = 'active' AND u.role = ANY($3::text[])`;

async function loadSession(req) {
  const { portal, token } = resolveSessionToken(req);
  if (!token) return null;

  const claims = jwt.verify(token, process.env.JWT_SECRET);
  if (claims.type !== 'session' || !claims.sid) return null;

  if (portal === 'admin' || portal === null) {
    const result = await pool.query(ADMIN_SESSION_QUERY, [claims.sid, claims.sub]);
    if (result.rowCount) {
      const auth = { ...result.rows[0], session_type: 'admin', session_portal: 'admin' };
      await touchSession('admin', auth.session_id, auth.last_seen_at);
      return auth;
    }
    if (portal === 'admin') return null;
  }

  const roles = portal === null ? ['student', 'teacher'] : [portal];
  const result = await pool.query(USER_SESSION_QUERY, [claims.sid, claims.sub, roles]);
  if (!result.rowCount) return null;

  const auth = {
    ...result.rows[0],
    session_type: 'user',
    session_portal: result.rows[0].account_role,
  };
  await touchSession('user', auth.session_id, auth.last_seen_at);
  return auth;
}

function sessionError(error, res) {
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Session is invalid or expired.' });
  }
  return null;
}

export async function requireAdmin(req, res, next) {
  try {
    const auth = await loadSession(req);
    if (!auth) return res.status(401).json({ error: 'Authentication required.' });
    if (auth.session_type !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    req.auth = auth;
    return next();
  } catch (error) {
    return sessionError(error, res) ?? next(error);
  }
}

export async function requireAuthenticatedUser(req, res, next) {
  try {
    const auth = await loadSession(req);
    if (!auth) return res.status(401).json({ error: 'Session is invalid or expired.' });
    req.auth = auth;
    return next();
  } catch (error) {
    return sessionError(error, res) ?? next(error);
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
