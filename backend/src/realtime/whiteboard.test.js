import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerWhiteboardHandlers } from './whiteboard.js';

class FakeSocket {
  constructor(kind, userId) {
    this.data = { kind, userId };
    this.handlers = new Map();
    this.rooms = new Set();
    this.broadcasts = [];
    this.messages = [];
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  emit(event, payload) {
    this.messages.push({ event, payload });
  }

  to(room) {
    return {
      emit: (event, payload) => this.broadcasts.push({ room, event, payload }),
    };
  }

  async join(room) {
    this.rooms.add(room);
  }

  async leave(room) {
    this.rooms.delete(room);
  }

  async trigger(event, payload) {
    let response;
    await this.handlers.get(event)(payload, (value) => { response = value; });
    return response;
  }
}

function authorizedPool() {
  return { query: async () => ({ rowCount: 1 }) };
}

test('teacher drawing is shared with the student', async () => {
  const sessionId = randomUUID();
  const teacher = new FakeSocket('teacher', 'teacher-id');
  registerWhiteboardHandlers(teacher, authorizedPool());

  const joined = await teacher.trigger('whiteboard:join', { sessionId });
  assert.equal(joined.ok, true);
  assert.deepEqual(joined.strokes, []);

  const start = await teacher.trigger('whiteboard:stroke:start', {
    sessionId,
    stroke: { id: 'stroke-1', tool: 'pen', color: '#2563eb', width: 3, points: [{ x: 0.1, y: 0.2 }] },
  });
  assert.equal(start.ok, true);

  await teacher.trigger('whiteboard:stroke:points', {
    sessionId,
    strokeId: 'stroke-1',
    points: [{ x: 0.3, y: 0.4 }],
  });

  const student = new FakeSocket('student', 'student-id');
  registerWhiteboardHandlers(student, authorizedPool());
  const studentJoin = await student.trigger('whiteboard:join', { sessionId });
  assert.equal(studentJoin.ok, true);
  assert.deepEqual(studentJoin.strokes[0].points, [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]);
  assert.equal(teacher.broadcasts[0].event, 'whiteboard:stroke:start');
  assert.equal(teacher.broadcasts[1].event, 'whiteboard:stroke:points');
});

test('students can view but cannot draw or clear the board', async () => {
  const sessionId = randomUUID();
  const teacher = new FakeSocket('teacher', 'teacher-id');
  registerWhiteboardHandlers(teacher, authorizedPool());
  await teacher.trigger('whiteboard:join', { sessionId });
  await teacher.trigger('whiteboard:stroke:start', {
    sessionId,
    stroke: { id: 'teacher-stroke', tool: 'pen', color: '#2563eb', width: 3, points: [{ x: 0.1, y: 0.2 }] },
  });

  const student = new FakeSocket('student', 'student-id');
  registerWhiteboardHandlers(student, authorizedPool());
  const joined = await student.trigger('whiteboard:join', { sessionId });
  assert.equal(joined.ok, true);

  const start = await student.trigger('whiteboard:stroke:start', {
    sessionId,
    stroke: { id: 'student-stroke', tool: 'pen', color: '#2563eb', width: 3, points: [{ x: 0.3, y: 0.4 }] },
  });
  const points = await student.trigger('whiteboard:stroke:points', {
    sessionId,
    strokeId: 'teacher-stroke',
    points: [{ x: 0.5, y: 0.6 }],
  });
  const clear = await student.trigger('whiteboard:clear', { sessionId });

  assert.equal(start.ok, false);
  assert.equal(points.ok, false);
  assert.equal(clear.ok, false);
  assert.equal(teacher.broadcasts.length, 1);
  const finalState = await teacher.trigger('whiteboard:join', { sessionId });
  assert.deepEqual(finalState.strokes[0].points, [{ x: 0.1, y: 0.2 }]);
});

test('participants cannot join another class board', async () => {
  const socket = new FakeSocket('student', 'student-id');
  registerWhiteboardHandlers(socket, { query: async () => ({ rowCount: 0 }) });

  const response = await socket.trigger('whiteboard:join', { sessionId: randomUUID() });
  assert.equal(response.ok, false);
  assert.equal(socket.rooms.size, 0);
});

test('teacher board access checks the active teacher session and booking participant', async () => {
  const sessionId = randomUUID();
  const authSessionId = randomUUID();
  const socket = new FakeSocket('teacher', 'teacher-id');
  socket.data.sessionId = authSessionId;
  let queryText = '';
  let queryValues = [];
  registerWhiteboardHandlers(socket, {
    query: async (text, values) => {
      queryText = text;
      queryValues = values;
      return { rowCount: 1 };
    },
  });

  const response = await socket.trigger('whiteboard:join', { sessionId });
  assert.equal(response.ok, true);
  assert.match(queryText, /b\.teacher_id = \$2/);
  assert.match(queryText, /auth_session\.id = \$3/);
  assert.deepEqual(queryValues, [sessionId, 'teacher-id', authSessionId, 'teacher']);
});

test('board rejects invalid or unbounded drawing points', async () => {
  const sessionId = randomUUID();
  const socket = new FakeSocket('teacher', 'teacher-id');
  registerWhiteboardHandlers(socket, authorizedPool());
  await socket.trigger('whiteboard:join', { sessionId });

  const response = await socket.trigger('whiteboard:stroke:start', {
    sessionId,
    stroke: { id: 'invalid', tool: 'pen', color: '#2563eb', width: 3, points: [{ x: 2, y: 0.5 }] },
  });
  assert.equal(response.ok, false);
  assert.equal(socket.broadcasts.length, 0);
});
