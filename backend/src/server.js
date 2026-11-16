import './config.js';
import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import { pool } from './db/pool.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}

const app = express();
const server = http.createServer(app);
const origin = process.env.ADMIN_ORIGIN || 'http://localhost:5173';
const io = new SocketServer(server, {
  cors: { origin, credentials: true },
});

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(helmet());
app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    return next(error);
  }
});
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

app.use((_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((error, _req, res, _next) => {
  console.error('API request failed:', error.message);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  return res.status(status).json({
    error: status === 500 ? 'The request could not be completed.' : error.message,
  });
});

function getCookie(cookieHeader, name) {
  const entry = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

io.use(async (socket, next) => {
  try {
    const token = getCookie(socket.handshake.headers.cookie, 'edtech_session') ??
      getCookie(socket.handshake.headers.cookie, 'admin_session');
    if (!token) return next(new Error('Authentication required.'));
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (claims.type !== 'session') return next(new Error('Authentication required.'));
    const result = await pool.query(
      `SELECT u.id FROM admin_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN admin_profiles ap ON ap.user_id = u.id
       JOIN admin_roles r ON r.id = ap.role_id
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()
         AND u.status = 'active' AND p.module = 'chat_moderation' AND p.action = 'view'`,
      [claims.sid, claims.sub],
    );
    if (!result.rowCount) return next(new Error('Chat moderation access is not authorized.'));
    socket.data.adminId = result.rows[0].id;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new Error('Authentication required.'));
    }
    console.error('Socket authorization failed:', error.message);
    return next(new Error('Chat moderation authorization is temporarily unavailable.'));
  }
});

io.on('connection', (socket) => {
  socket.join('admin-chat-moderation');
});

const port = Number(process.env.API_PORT || 4000);
server.listen(port, () => {
  console.log(`EdTech admin API listening on http://localhost:${port}`);
});

async function shutdown() {
  await new Promise((resolve) => io.close(resolve));
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
