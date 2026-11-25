# EdTech API contract

Base URL: `/api` in local development. For deployed frontends, set `VITE_API_URL` to the API origin and the client will prepend `/api`. All responses are JSON except report/CSV downloads. Errors are `{ "error": "message" }` with optional `details`.

## Transport and sessions

- Requests use `credentials: 'include'`.
- Portal hint header `X-Portal: student|teacher|admin` is sent by the frontends.
- Session cookies are role-specific and HttpOnly:
  - `edtech_student_session`
  - `edtech_teacher_session`
  - `edtech_admin_session`
- A new login revokes the user's previous active session.
- Auth routes are rate-limited per IP, email, and portal.
- Admin provider/account actions have separate rate limits.

## Auth endpoints

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/auth/register` | `{role:'student'|'teacher', name, email, password, phone?, age?, grade?, subjects?, hourly_rate?, bio?}` | 201 `{user}` |
| POST | `/auth/login` | `{email, password, portal, rememberMe?, code?}` | Depends on role/MFA state |
| POST | `/auth/mfa/confirm` | `{challenge, code}` | 200 `{user, permissions}` + cookie |
| POST | `/auth/mfa/verify` | `{challenge, code}` | 200 `{user, permissions}` + cookie |
| POST | `/auth/password-reset/request` | `{email}` | 202 |
| POST | `/auth/password-reset/confirm` | `{token, password}` | 200 |
| GET | `/auth/me` | - | `{user, permissions}` |
| POST | `/auth/logout` | - | 204 |

First login for any role returns `{requiresMfaSetup:true, challenge, otpAuthUrl, accountName}`; later logins return `{requiresMfa:true, challenge}` unless a valid `code` is supplied. Complete setup with `/auth/mfa/confirm` and later sign-ins with `/auth/mfa/verify`. Password minimum is 12 characters. Students require `age`; teachers require `phone`, `subjects`, and `hourly_rate` and are auto-approved.

## Student endpoints

All require a student session.

| Method | Path | Returns / notes |
|---|---|---|
| GET/PATCH | `/profile` | Student profile read/update |
| GET | `/teachers?search=` | Approved teachers with subjects, rate, availability |
| GET | `/teachers/:id` | One approved teacher |
| POST | `/bookings` | `{teacher_id, date, start_time, end_time}`; validates availability and overlap, computes amount |
| GET | `/bookings/mine` | Student bookings |
| POST | `/payments/order` | `{booking_id}` -> Razorpay order params; booking must be `approved` |
| POST | `/payments/verify` | `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` |
| POST | `/payments/webhook` | Raw Razorpay webhook, `X-Razorpay-Signature` |
| GET | `/payments/mine` | Payment history |
| GET | `/sessions/mine` | Class sessions, timing, attendance count, recording fields |
| POST | `/sessions/:id/attendance` | `{action:'join'|'leave'}`; records student attendance |
| POST | `/sessions/:id/meeting` | Creates/returns meeting URL; student cannot join before start |
| GET | `/sessions/:id/materials` | Materials for a paid/completed class the student is enrolled in |
| GET | `/sessions/:id/materials/:materialId/file` | Streams an uploaded material; link materials use `external_url` |
| GET | `/sessions/:id/messages` | Private messages between the student and the class teacher |
| GET | `/chat/messages?room=global` | Latest 50 visible messages |
| POST | `/feedback` | `{booking_id, rating, testimony_text, allow_display}`; completed bookings only |
| GET | `/feedback/mine` | Student feedback |

Booking statuses: `pending`, `approved`, `rejected`, `paid`, `completed`, `cancelled`.

## Teacher endpoints

All require a teacher session.

| Method | Path | Returns / notes |
|---|---|---|
| GET/PATCH | `/profile` | Teacher profile read/update |
| GET/PUT | `/availability` | Weekly availability slots |
| GET | `/bookings?status=&from=&to=&limit=` | Booking queue with filters |
| POST | `/bookings/:id/approve` | Approve a pending booking |
| POST | `/bookings/:id/reject` | Reject a pending booking |
| PATCH | `/bookings/:id` | `{action:'approve'|'reject'}` |
| GET | `/sessions` | Class sessions with filters |
| GET | `/sessions/:id` | Session detail plus attendance records |
| POST | `/sessions/:id/meeting` | Creates/returns meeting URL; teacher may prepare before start |
| GET/POST | `/sessions/:id/materials` | List or add a link material (`title`, `description?`, `url`) |
| POST | `/sessions/:id/materials/file` | Raw `application/octet-stream` upload (10 MB max); headers `X-Material-Title`, `X-Material-Description`, `X-Filename`, `X-Material-Mime` (URI-encoded) |
| GET | `/sessions/:id/materials/:materialId/file` | Streams an uploaded material |
| DELETE | `/sessions/:id/materials/:materialId` | Deletes a material |
| GET | `/sessions/:id/messages` | Private messages between the teacher and the class student |
| POST | `/sessions/:id/start` | Marks session ongoing and records teacher join |
| POST | `/sessions/:id/end` | Marks session complete and records teacher leave |
| PATCH | `/sessions/:id/recording-consent` | `{consent:boolean}` |
| PATCH | `/sessions/:id/recording` | `{url:string|null}`; requires consent |
| GET | `/chat/messages?room=global` | Latest 50 visible messages with sender roles |
| GET | `/feedback` | Feedback for this teacher |
| GET | `/dashboard/stats` | Aggregate teacher stats |

## Admin endpoints

All require an admin session and the listed permission where applicable.

| Area | Endpoints |
|---|---|
| Overview | `GET /overview`, `GET /reports/export?format=pdf|xlsx` |
| Chat | `GET /chat/messages`, `GET/POST /modules/chat_moderation`, `PATCH /modules/chat_moderation/:id` |
| People | `GET/POST /students`, `GET/POST /teachers`, `PATCH /students/:id`, `PATCH /teachers/:id`, bulk status, CSV export, password reset |
| Admins | `GET/POST /admins`, `PATCH /admins/:id`, `GET /admins/:id/sessions`, `POST /admins/:id/revoke-sessions` |
| Security | `GET /security/sessions/active`, `POST /security/sessions/:id/revoke` |
| Roles | `GET /roles`, `GET /permissions`, `POST /roles`, `PUT /roles/:id/permissions` |
| Finance | `POST /transactions/:id/refund`, `GET /refunds/:id/status`, `POST /bookings/:id/record-bank-transfer` |
| Notifications | Email delivery records in the notification centre |
| Meetings | `GET /meeting-checks`, `POST /live-classes/:id/create-meeting`, `POST /live-classes/:id/send-join-details`, `POST /live-classes/:id/test-meeting` |
| Modules | `GET/POST /modules/:module`, `PATCH /modules/:module/:id` |
| Search | `GET /search?q=` |

Modules: `bookings`, `live_classes`, `chat_moderation`, `support`, `transactions`, `refunds`, `payouts`, `revenue_analytics`, `recordings`, `attendance`, `reports`, `activity_logs`, `notifications`, `templates`, `announcements`, `configuration`, `integrations`, `security`, `backups`, `maintenance`.

## Socket.IO

Connect to the API origin with cookies, `auth.portal` set to `student` or `teacher`, and WebSocket transport. Admin moderators are authorized by role cookie and permission.

### Global chat

- Server emits `chat:ready` to students and teachers after joining `global`.
- Send `chat:message` with `{room:'global', content}`; students and teachers may send.
- Receive `chat:message:new` with `sender_role` and `sender_role_label`.
- Errors arrive as `chat:error`.
- Moderators receive `chat:new` in `admin-chat-moderation` and never join `global`.

### Whiteboard

- `whiteboard:join` `{sessionId}` -> `{ok, strokes}`; requires an active paid class participant.
- `whiteboard:leave` `{sessionId}`
- `whiteboard:stroke:start` `{sessionId, stroke}`; stroke tools are `pen`, `eraser`, `rectangle`, `ellipse`, `note`
- `whiteboard:stroke:points` `{sessionId, strokeId, points}`; pen and eraser only
- `whiteboard:delete` `{sessionId, strokeId}` -> emits `whiteboard:remove` `{strokeId}`
- `whiteboard:replace` `{sessionId, strokes}` -> emits `whiteboard:replace` `{strokes}`
- `whiteboard:undo` `{sessionId}` -> callback `{ok, strokes}`
- `whiteboard:redo` `{sessionId}` -> callback `{ok, strokes}`
- `whiteboard:clear` `{sessionId}`
- `whiteboard:error` `{message}`

Only teachers may draw, edit, or clear; students receive live updates. Board state is in-memory and temporary.

### Class materials and private messages (HTTP)

- Materials require a session participant with booking status `paid` or `completed` and a session that is not `cancelled`.
- Uploads are capped at 10 MB. Each material is exactly one of an uploaded file or an `http(s)` link.
- Teacher material headers: `X-Material-Title`, `X-Material-Description`, `X-Filename`, `X-Material-Mime`; values are URI-encoded.
- Private messages are persisted in `class_messages`, limited to 500 characters, and only readable by the class teacher and the enrolled student.

### Class private chat (Socket.IO)

- `class:join` `{sessionId}` -> callback `{ok, teacherId, studentId}`; joins room `class:<sessionId>`
- `class:leave` `{sessionId}`
- `class:message` `{sessionId, content}` -> persists and broadcasts `class:message:new`
- `class:message:new` `{id, session_id, sender_id, sender_name, sender_role, recipient_id, content, created_at}`
- Errors arrive as `class:error` `{message}`
- Student messages from ages 10-12 are passed through the profanity filter before storage and broadcast.

## Provider constraints

- Razorpay refunds are full refunds only, INR only, with `rzp_test_` keys and `RAZORPAY_TEST_MODE=true`.
- Jitsi test mode works only in development/test and creates public room links.
- Google Meet test mode also requires OAuth credentials and development/test mode.
- Email delivery is restricted by the dev/test allowlist.
