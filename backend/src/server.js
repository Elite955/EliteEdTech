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
import { studentRouter } from './routes/student.js';
import { teacherRouter } from './routes/teacher.js';
import { censorContent } from './security/profanity.js';
import { PORTAL_COOKIES, normalizePortal, portalFromOrigin } from './security/portals.js';
import { registerWhiteboardHandlers } from './realtime/whiteboard.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}

const app = express();
const server = http.createServer(app);
const allowedOrigins = [...new Set([
  process.env.ADMIN_ORIGIN,
  process.env.TEACHER_ORIGIN,
  process.env.STUDENT_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
].filter(Boolean))];
const corsOrigin = (requestOrigin, callback) => callback(null, !requestOrigin || allowedOrigins.includes(requestOrigin));
const io = new SocketServer(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }));
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
app.use('/api', studentRouter);
app.use('/api/teacher', teacherRouter);

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
    const cookieHeader = socket.handshake.headers.cookie;
    const hintedPortal = normalizePortal(socket.handshake.auth?.portal) ??
      portalFromOrigin(socket.handshake.headers.origin);
    let portal = hintedPortal;
    let token = hintedPortal ? getCookie(cookieHeader, PORTAL_COOKIES[hintedPortal]) : null;

    if (!hintedPortal) {
      for (const candidate of ['admin', 'teacher', 'student']) {
        const candidateToken = getCookie(cookieHeader, PORTAL_COOKIES[candidate]);
        if (candidateToken) {
          token = candidateToken;
          portal = candidate;
          break;
        }
      }
      if (!token) token = getCookie(cookieHeader, 'edtech_session') ?? getCookie(cookieHeader, 'admin_session');
    }

    if (!token) return next(new Error('Authentication required.'));
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    if (claims.type !== 'session') return next(new Error('Authentication required.'));

    if (portal === 'admin' || portal === null) {
      const adminResult = await pool.query(
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
      if (adminResult.rowCount) {
        socket.data.kind = 'moderator';
        socket.data.adminId = adminResult.rows[0].id;
        return next();
      }
      if (portal === 'admin') return next(new Error('Chat access is not authorized.'));
    }

    if (portal === 'teacher') {
      const teacherResult = await pool.query(
        `SELECT u.id, u.name
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()
           AND u.status = 'active' AND u.role = 'teacher'`,
        [claims.sid, claims.sub],
      );
      if (!teacherResult.rowCount) return next(new Error('Teacher access is not authorized.'));
      const teacher = teacherResult.rows[0];
      socket.data.kind = 'teacher';
      socket.data.userId = teacher.id;
      socket.data.userName = teacher.name;
      socket.data.sessionId = claims.sid;
      return next();
    }

    const studentResult = await pool.query(
      `SELECT u.id, u.name, u.status, u.role, sp.age
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()
          AND u.status = 'active' AND u.role = 'student'`,
      [claims.sid, claims.sub],
    );
    if (!studentResult.rowCount) return next(new Error('Chat access is not authorized.'));
    const student = studentResult.rows[0];
    socket.data.kind = 'student';
    socket.data.userId = student.id;
    socket.data.userName = student.name;
    socket.data.age = student.age ?? null;
    socket.data.sessionId = claims.sid;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new Error('Authentication required.'));
    }
    console.error('Socket authorization failed:', error.message);
    return next(new Error('Chat authorization is temporarily unavailable.'));
  }
});

io.on('connection', (socket) => {
  if (socket.data.kind === 'moderator') {
    socket.join('admin-chat-moderation');
    return;
  }
  if (socket.data.kind === 'student' || socket.data.kind === 'teacher') {
    socket.join('global');
    socket.emit('chat:ready', { room: 'global' });
    registerWhiteboardHandlers(socket, pool);
  }
  if (socket.data.kind !== 'student' && socket.data.kind !== 'teacher') return;

  socket.on('chat:message', async (payload, callback) => {
    try {
      const room = typeof payload?.room === 'string' ? payload.room : '';
      const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
      if (room !== 'global' || content.length < 1 || content.length > 500) {
        socket.emit('chat:error', { message: 'Messages must be 1-500 characters in the global room.' });
        callback?.({ ok: false });
        return;
      }
      const { rows: senderRows } = await pool.query(
        `SELECT u.status, u.role, sp.age
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1`,
        [socket.data.userId],
      );
      const sender = senderRows[0];
      if (!sender || sender.status !== 'active' || sender.role !== socket.data.kind) {
        socket.emit('chat:error', { message: 'Your account can no longer send messages.' });
        callback?.({ ok: false });
        return;
      }
      const needsCensor = sender.role === 'student' && sender.age !== null && sender.age >= 10 && sender.age <= 12;
      const finalContent = needsCensor ? censorContent(content) : content;

      const { rows: inserted } = await pool.query(
        `INSERT INTO chat_messages (sender_id, room, content) VALUES ($1, 'global', $2)
         RETURNING id, created_at`,
        [socket.data.userId, finalContent],
      );
      const message = {
        id: inserted[0].id,
        room: 'global',
        sender_id: socket.data.userId,
        sender_name: socket.data.userName,
        sender_role: sender.role,
        sender_role_label: sender.role === 'teacher' ? 'Teacher' : 'Student',
        content: finalContent,
        created_at: inserted[0].created_at,
      };
      io.to('global').emit('chat:message:new', message);
      io.to('admin-chat-moderation').emit('chat:new', {
        ...message,
        age: needsCensor ? sender.age : socket.data.age,
        censored: needsCensor,
      });
      callback?.({ ok: true, id: message.id });
    } catch (error) {
      console.error('Chat message handling failed:', error.message);
      socket.emit('chat:error', { message: 'The message could not be sent. Try again.' });
      callback?.({ ok: false });
    }
  });
});

const port = Number(process.env.API_PORT || 4000);
server.listen(port, () => {
  console.log(`Elite admin API listening on http://localhost:${port}`);
});

async function shutdown() {
  await new Promise((resolve) => io.close(resolve));
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
