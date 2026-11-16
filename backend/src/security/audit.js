import { pool } from '../db/pool.js';

export async function writeAudit(req, { actorId = null, event, module, targetId = null, details = {} }) {
  await pool.query(
    `INSERT INTO audit_logs (actor_id, event, module, target_id, ip_address, user_agent, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorId ?? req.auth?.id ?? null, event, module, targetId, req.ip, req.get('user-agent') ?? null, details],
  );
}
