const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STROKE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const ALLOWED_COLORS = new Set(['#0f172a', '#2563eb', '#dc2626', '#16a34a', '#7c3aed']);
const ALLOWED_TOOLS = new Set(['pen', 'eraser', 'rectangle', 'ellipse', 'note']);
const MAX_STROKES = 300;
const MAX_POINTS_PER_STROKE = 2000;
const MAX_BOARD_POINTS = 20000;
const MAX_POINTS_PER_UPDATE = 50;
const MAX_NOTE_LENGTH = 500;
const MAX_HISTORY = 50;
const MAX_BOARD_SESSIONS = 25;
const BOARD_IDLE_TTL_MS = 3 * 60 * 60 * 1000;

const boards = new Map();

function removeExpiredBoards(now) {
  for (const [id, board] of boards) {
    if (now - board.lastActivity > BOARD_IDLE_TTL_MS) boards.delete(id);
  }
}

const cleanupTimer = setInterval(() => removeExpiredBoards(Date.now()), 15 * 60 * 1000);
cleanupTimer.unref?.();

function roomName(sessionId) {
  return `whiteboard:${sessionId}`;
}

function cloneStrokes(strokes) {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function getBoard(sessionId) {
  const now = Date.now();
  removeExpiredBoards(now);
  if (!boards.has(sessionId) && boards.size >= MAX_BOARD_SESSIONS) {
    const oldest = [...boards.entries()].sort((first, second) => first[1].lastActivity - second[1].lastActivity)[0];
    if (oldest) boards.delete(oldest[0]);
  }
  let board = boards.get(sessionId);
  if (!board) {
    board = { strokes: [], pointCount: 0, lastActivity: now, undoStack: [], redoStack: [] };
    boards.set(sessionId, board);
  }
  if (!Array.isArray(board.undoStack)) board.undoStack = [];
  if (!Array.isArray(board.redoStack)) board.redoStack = [];
  board.lastActivity = now;
  return board;
}

function pushHistory(board) {
  board.undoStack.push(cloneStrokes(board.strokes));
  if (board.undoStack.length > MAX_HISTORY) board.undoStack.shift();
  board.redoStack = [];
}

function countPoints(strokes) {
  return strokes.reduce((total, stroke) => total + stroke.points.length, 0);
}

function validPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function validPoints(points, { min = 1, max = MAX_POINTS_PER_UPDATE } = {}) {
  return Array.isArray(points) && points.length >= min && points.length <= max && points.every(validPoint);
}

function validStroke(stroke, { maxPoints = MAX_POINTS_PER_STROKE } = {}) {
  if (!stroke || typeof stroke.id !== 'string' || !STROKE_ID_PATTERN.test(stroke.id) ||
    !ALLOWED_TOOLS.has(stroke.tool) || !validPoints(stroke.points, { max: maxPoints }) ||
    !Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 48) {
    return false;
  }
  if (stroke.tool !== 'eraser' && !ALLOWED_COLORS.has(stroke.color)) return false;
  if (stroke.tool === 'note') {
    return stroke.points.length === 1 && typeof stroke.text === 'string' &&
      stroke.text.trim().length >= 1 && stroke.text.length <= MAX_NOTE_LENGTH;
  }
  return true;
}

function safeStroke(stroke) {
  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.tool === 'eraser' ? '#ffffff' : stroke.color,
    width: stroke.width,
    points: stroke.points.map((point) => ({ x: point.x, y: point.y })),
    ...(stroke.tool === 'note' ? { text: stroke.text.trim() } : {}),
  };
}

function respond(socket, callback, error) {
  const result = error ? { ok: false, error } : { ok: true };
  callback?.(result);
  if (error) socket.emit('whiteboard:error', { message: error });
}

function joinedBoard(socket, payload, callback) {
  const sessionId = payload?.sessionId;
  if (typeof sessionId !== 'string' || sessionId !== socket.data.whiteboardSessionId) {
    respond(socket, callback, 'Join this class board before editing it.');
    return null;
  }
  return { sessionId, room: roomName(sessionId), board: getBoard(sessionId) };
}

function teacherOnly(socket, callback) {
  if (socket.data.kind === 'teacher') return true;
  respond(socket, callback, 'Only the teacher can edit or clear this board.');
  return false;
}

export function registerWhiteboardHandlers(socket, pool) {
  socket.on('whiteboard:leave', (payload, callback) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId === 'string' && sessionId === socket.data.whiteboardSessionId) {
      socket.leave(roomName(sessionId));
      delete socket.data.whiteboardSessionId;
    }
    callback?.({ ok: true });
  });

  socket.on('whiteboard:join', async (payload, callback) => {
    const sessionId = payload?.sessionId;
    if (!['student', 'teacher'].includes(socket.data.kind) ||
      typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      respond(socket, callback, 'This class board is not available.');
      return;
    }

    try {
      const participantColumn = socket.data.kind === 'student' ? 'b.student_id' : 'b.teacher_id';
      const { rowCount } = await pool.query(
        `SELECT cs.id
         FROM class_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         WHERE cs.id = $1 AND ${participantColumn} = $2
           AND b.status = 'paid' AND cs.status IN ('scheduled', 'ongoing')
           AND EXISTS (
             SELECT 1
             FROM user_sessions auth_session
             JOIN users participant ON participant.id = auth_session.user_id
             WHERE auth_session.id = $3 AND auth_session.user_id = $2
               AND auth_session.revoked_at IS NULL AND auth_session.expires_at > now()
               AND participant.status = 'active' AND participant.role = $4
           )`,
        [sessionId, socket.data.userId, socket.data.sessionId, socket.data.kind],
      );
      if (!rowCount) {
        respond(socket, callback, 'You are not a participant in this active class.');
        return;
      }

      const previousSessionId = socket.data.whiteboardSessionId;
      if (previousSessionId && previousSessionId !== sessionId) {
        await socket.leave(roomName(previousSessionId));
      }
      await socket.join(roomName(sessionId));
      socket.data.whiteboardSessionId = sessionId;
      const board = getBoard(sessionId);
      callback?.({ ok: true, strokes: cloneStrokes(board.strokes) });
    } catch (error) {
      console.error('Whiteboard access check failed:', error.message);
      respond(socket, callback, 'The shared board could not be opened. Please try again.');
    }
  });

  socket.on('whiteboard:stroke:start', (payload, callback) => {
    const joined = joinedBoard(socket, payload, callback);
    if (!joined) return;
    if (!teacherOnly(socket, callback)) return;
    const stroke = payload.stroke;
    const maxStartPoints = stroke?.tool === 'rectangle' || stroke?.tool === 'ellipse' ? 2 : 1;
    if (!validStroke(stroke, { maxPoints: maxStartPoints })) {
      respond(socket, callback, 'That drawing action is not valid.');
      return;
    }
    if (joined.board.strokes.length >= MAX_STROKES || joined.board.pointCount >= MAX_BOARD_POINTS) {
      respond(socket, callback, 'This board is full. Clear it to continue writing.');
      return;
    }
    if (joined.board.strokes.some((item) => item.id === stroke.id)) {
      respond(socket, callback, 'That drawing action has already been received.');
      return;
    }

    pushHistory(joined.board);
    const nextStroke = safeStroke(stroke);
    joined.board.strokes.push(nextStroke);
    joined.board.pointCount += nextStroke.points.length;
    joined.board.lastActivity = Date.now();
    socket.to(joined.room).emit('whiteboard:stroke:start', nextStroke);
    respond(socket, callback);
  });

  socket.on('whiteboard:stroke:points', (payload, callback) => {
    const joined = joinedBoard(socket, payload, callback);
    if (!joined) return;
    if (!teacherOnly(socket, callback)) return;
    if (!validPoints(payload.points) || !STROKE_ID_PATTERN.test(payload.strokeId ?? '')) {
      respond(socket, callback, 'That drawing update is not valid.');
      return;
    }
    const stroke = joined.board.strokes.find((item) => item.id === payload.strokeId);
    if (!stroke) {
      respond(socket, callback, 'The drawing stroke was not found.');
      return;
    }
    if (!['pen', 'eraser'].includes(stroke.tool)) {
      respond(socket, callback, 'This drawing tool cannot be extended.');
      return;
    }
    if (stroke.points.length + payload.points.length > MAX_POINTS_PER_STROKE ||
      joined.board.pointCount + payload.points.length > MAX_BOARD_POINTS) {
      respond(socket, callback, 'This board is full. Clear it to continue writing.');
      return;
    }

    const points = payload.points.map((point) => ({ x: point.x, y: point.y }));
    stroke.points.push(...points);
    joined.board.pointCount += points.length;
    joined.board.lastActivity = Date.now();
    socket.to(joined.room).emit('whiteboard:stroke:points', { strokeId: stroke.id, points });
    respond(socket, callback);
  });

  socket.on('whiteboard:clear', (payload, callback) => {
    const joined = joinedBoard(socket, payload, callback);
    if (!joined) return;
    if (!teacherOnly(socket, callback)) return;
    if (!joined.board.strokes.length) {
      respond(socket, callback);
      return;
    }
    pushHistory(joined.board);
    joined.board.strokes = [];
    joined.board.pointCount = 0;
    joined.board.lastActivity = Date.now();
    socket.to(joined.room).emit('whiteboard:clear');
    respond(socket, callback);
  });

  socket.on('whiteboard:delete', (payload, callback) => {
    const joined = joinedBoard(socket, payload, callback);
    if (!joined) return;
    if (!teacherOnly(socket, callback)) return;
    const strokeId = payload?.strokeId;
    if (typeof strokeId !== 'string' || !STROKE_ID_PATTERN.test(strokeId)) {
      respond(socket, callback, 'That board item is not valid.');
      return;
    }
    const index = joined.board.strokes.findIndex((stroke) => stroke.id === strokeId);
    if (index === -1) {
      respond(socket, callback, 'That board item was not found.');
      return;
    }
    pushHistory(joined.board);
    const [removed] = joined.board.strokes.splice(index, 1);
    joined.board.pointCount -= removed.points.length;
    joined.board.lastActivity = Date.now();
    socket.to(joined.room).emit('whiteboard:remove', { strokeId });
    respond(socket, callback);
  });

  socket.on('whiteboard:replace', (payload, callback) => {
    const joined = joinedBoard(socket, payload, callback);
    if (!joined) return;
    if (!teacherOnly(socket, callback)) return;
    const strokes = payload?.strokes;
    if (!Array.isArray(strokes) || strokes.length > MAX_STROKES ||
      !strokes.every((stroke) => validStroke(stroke)) ||
      new Set(strokes.map((stroke) => stroke.id)).size !== strokes.length ||
      countPoints(strokes) > MAX_BOARD_POINTS) {
      respond(socket, callback, 'That board update is not valid.');
      return;
    }
    pushHistory(joined.board);
    joined.board.strokes = strokes.map(safeStroke);
    joined.board.pointCount = countPoints(joined.board.strokes);
    joined.board.lastActivity = Date.now();
    socket.to(joined.room).emit('whiteboard:replace', { strokes: cloneStrokes(joined.board.strokes) });
    respond(socket, callback);
  });

  socket.on('whiteboard:undo', (payload, callback) => {
    const joined = joinedBoard(socket, payload, callback);
    if (!joined) return;
    if (!teacherOnly(socket, callback)) return;
    if (!joined.board.undoStack.length) {
      respond(socket, callback, 'There is nothing to undo.');
      return;
    }
    joined.board.redoStack.push(cloneStrokes(joined.board.strokes));
    joined.board.strokes = joined.board.undoStack.pop();
    joined.board.pointCount = countPoints(joined.board.strokes);
    joined.board.lastActivity = Date.now();
    socket.to(joined.room).emit('whiteboard:replace', { strokes: cloneStrokes(joined.board.strokes) });
    callback?.({ ok: true, strokes: cloneStrokes(joined.board.strokes) });
  });

  socket.on('whiteboard:redo', (payload, callback) => {
    const joined = joinedBoard(socket, payload, callback);
    if (!joined) return;
    if (!teacherOnly(socket, callback)) return;
    if (!joined.board.redoStack.length) {
      respond(socket, callback, 'There is nothing to redo.');
      return;
    }
    joined.board.undoStack.push(cloneStrokes(joined.board.strokes));
    joined.board.strokes = joined.board.redoStack.pop();
    joined.board.pointCount = countPoints(joined.board.strokes);
    joined.board.lastActivity = Date.now();
    socket.to(joined.room).emit('whiteboard:replace', { strokes: cloneStrokes(joined.board.strokes) });
    callback?.({ ok: true, strokes: cloneStrokes(joined.board.strokes) });
  });
}
