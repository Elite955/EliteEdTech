import { censorContent } from '../security/profanity.js';

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 500;

function roomName(sessionId) {
  return `class:${sessionId}`;
}

function respond(socket, callback, error) {
  const result = error ? { ok: false, error } : { ok: true };
  callback?.(result);
  if (error) socket.emit('class:error', { message: error });
}

async function loadParticipants(pool, sessionId, userId, kind) {
  const participantColumn = kind === 'student' ? 'b.student_id' : 'b.teacher_id';
  const { rows } = await pool.query(
    `SELECT b.teacher_id, b.student_id, cs.status AS session_status, b.status AS booking_status
     FROM class_sessions cs
     JOIN bookings b ON b.id = cs.booking_id
     WHERE cs.id = $1 AND ${participantColumn} = $2`,
    [sessionId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  if (!['paid', 'completed'].includes(row.booking_status)) return null;
  if (row.session_status === 'cancelled') return null;
  return row;
}

export function registerClassroomHandlers(socket, pool) {
  if (!['student', 'teacher'].includes(socket.data.kind)) return;

  socket.on('class:leave', (payload, callback) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId === 'string' && sessionId === socket.data.classSessionId) {
      socket.leave(roomName(sessionId));
      delete socket.data.classSessionId;
    }
    callback?.({ ok: true });
  });

  socket.on('class:join', async (payload, callback) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      respond(socket, callback, 'This class chat is not available.');
      return;
    }
    if (!['student', 'teacher'].includes(socket.data.kind)) {
      respond(socket, callback, 'This class chat is not available.');
      return;
    }
    try {
      const participants = await loadParticipants(pool, sessionId, socket.data.userId, socket.data.kind);
      if (!participants) {
        respond(socket, callback, 'You are not a participant in this paid class.');
        return;
      }
      const previous = socket.data.classSessionId;
      if (previous && previous !== sessionId) await socket.leave(roomName(previous));
      await socket.join(roomName(sessionId));
      socket.data.classSessionId = sessionId;
      callback?.({
        ok: true,
        teacherId: participants.teacher_id,
        studentId: participants.student_id,
      });
    } catch (error) {
      console.error('Class chat access check failed:', error.message);
      respond(socket, callback, 'The class chat could not be opened. Please try again.');
    }
  });

  socket.on('class:message', async (payload, callback) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId) ||
      sessionId !== socket.data.classSessionId) {
      respond(socket, callback, 'Join this class chat before sending a message.');
      return;
    }
    const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
    if (content.length < 1 || content.length > MAX_MESSAGE_LENGTH) {
      respond(socket, callback, `Messages must be 1-${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    try {
      const participants = await loadParticipants(pool, sessionId, socket.data.userId, socket.data.kind);
      if (!participants) {
        respond(socket, callback, 'You are not a participant in this paid class.');
        return;
      }
      const recipientId = socket.data.kind === 'teacher' ? participants.student_id : participants.teacher_id;
      if (recipientId === socket.data.userId) {
        respond(socket, callback, 'You cannot message yourself.');
        return;
      }
      const { rows: senderRows } = await pool.query(
        `SELECT u.status, u.role, u.name, sp.age
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1`,
        [socket.data.userId],
      );
      const sender = senderRows[0];
      if (!sender || sender.status !== 'active' || sender.role !== socket.data.kind) {
        respond(socket, callback, 'Your account can no longer send messages.');
        return;
      }
      const { rows: recipientRows } = await pool.query(
        `SELECT id, status, role FROM users WHERE id = $1`,
        [recipientId],
      );
      const recipient = recipientRows[0];
      if (!recipient || recipient.status !== 'active') {
        respond(socket, callback, 'The other participant cannot receive messages right now.');
        return;
      }
      const needsCensor = sender.role === 'student' && sender.age !== null && sender.age >= 10 && sender.age <= 12;
      const finalContent = needsCensor ? censorContent(content) : content;
      const { rows: inserted } = await pool.query(
        `INSERT INTO class_messages (session_id, sender_id, recipient_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [sessionId, socket.data.userId, recipientId, finalContent],
      );
      const message = {
        id: inserted[0].id,
        session_id: sessionId,
        sender_id: socket.data.userId,
        sender_name: sender.name,
        sender_role: sender.role,
        recipient_id: recipientId,
        content: finalContent,
        created_at: inserted[0].created_at,
      };
      socket.nsp.to(roomName(sessionId)).emit('class:message:new', message);
      callback?.({ ok: true, message });
    } catch (error) {
      console.error('Class message handling failed:', error.message);
      respond(socket, callback, 'The message could not be sent. Try again.');
    }
  });
}
