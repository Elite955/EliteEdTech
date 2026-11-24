import '../src/config.js';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { pool } from '../src/db/pool.js';

// End-to-end check of the socket token flow: create a real session row, ask the
// API to mint a socket token, then complete a Socket.IO handshake with it.
const { rows: users } = await pool.query(
  `SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id = u.id WHERE u.role = 'student' LIMIT 1`,
);
if (!users.length) throw new Error('no student account in this database');
const userId = users[0].id;

const sessionId = randomUUID();
await pool.query(
  `INSERT INTO user_sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
  [sessionId, userId],
);
const sessionToken = jwt.sign(
  { sub: userId, sid: sessionId, type: 'session' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' },
);

try {
  const response = await fetch('http://localhost:4000/api/auth/socket-token', {
    headers: { cookie: `edtech_student_session=${sessionToken}` },
  });
  const body = await response.json();
  console.log('token endpoint:', response.status, body.token ? 'token issued' : JSON.stringify(body).slice(0, 80));

  await new Promise((resolve) => {
    const socket = io('http://localhost:4000', {
      transports: ['websocket'],
      auth: { portal: 'student', token: body.token },
      reconnection: false,
    });
    const done = (message) => {
      console.log('socket:', message);
      socket.close();
      resolve();
    };
    socket.on('connect', () => done('CONNECTED'));
    socket.on('connect_error', (error) => done(`ERROR: ${error.message}`));
    setTimeout(() => done('TIMEOUT'), 10000);
  });
} finally {
  await pool.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
  await pool.end();
}
