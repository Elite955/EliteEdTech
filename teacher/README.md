# Teacher Portal

React 19 + TypeScript + Vite SPA on port `5174`. It consumes the backend API and Socket.IO server.

## Run

```bash
cd teacher
npm install
npm run dev
npm run lint
npm run build
```

The dev server proxies `/api` and `/socket.io` to `http://localhost:4000`. For deployed builds, set `VITE_API_URL` to the API origin and `VITE_SOCKET_URL` to the Socket.IO origin.

## Features

- Profile management: subjects, bio, hourly rate.
- Weekly availability management.
- Booking queue with approve/reject.
- Conduct class with Jitsi embedded meeting or external Google Meet/Zoom link.
- Teacher-controlled shared whiteboard; students view live updates.
- Start/end session, teacher attendance recording, recording consent, and recording link storage.
- Schedule, session logs, attendance, and student feedback.
- Global chat with role-tagged teacher/student messages.

## API

The current endpoint list is in `../shared/api-contract.md`. Teacher routes use the `edtech_teacher_session` HttpOnly cookie and TOTP MFA after first sign-in. Attendance is written by `POST /api/sessions/:id/start` and `/end`, and recording links are saved with `PATCH /api/teacher/sessions/:id/recording` after recording consent is enabled.
