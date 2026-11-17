# EDTECH API contract — student portal

Base URL: `/api`. All responses are JSON. Errors are always `{ "error": "message" }` (plus optional `details` on validation). HTTP status carries the meaning.

## Authentication

Cookie session, not tokens. After login/MFA the server sets `edtech_session` (HttpOnly). Every request must include credentials:

```js
fetch('/api/...', { credentials: 'include' })
```

- There is no Authorization header and no bearer token.
- Signing in again silently revokes the previous session — there is no ALREADY_SIGNED_IN 409.
- Rate limiting is currently disabled on auth routes (decision: remove until production hardening).

## Auth endpoints

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/auth/register` | `{name, email, phone?, password, age, grade?}` (student accounts only) | 201 `{user}` |
| POST | `/auth/login` | `{email, password, rememberMe?}` | `{user, permissions}` (teacher/admin) · `{requiresMfaSetup:true, challenge, otpAuthUrl}` (first student login) · `{requiresMfa:true, challenge}` (later student logins) |
| POST | `/auth/mfa/confirm` | `{challenge, code}` — enrollment, use after `requiresMfaSetup` | 200 `{user}` + session cookie |
| POST | `/auth/mfa/verify` | `{challenge, code}` — returning student login | 200 `{user}` + session cookie |
| POST | `/auth/logout` | — | 200, clears cookie |
| GET | `/auth/me` | — | `{user}` |

Student `user` shape: `{id, name, email, role:"Student", roleCode:"student", age, grade}`.

- `otpAuthUrl` is an `otpauth://` URI string; render the QR with `qrcode.react` (`<QRCodeSVG value={otpAuthUrl} />`).
- Password minimum is 12 characters.
- Teachers and admins do not use student MFA.

## Student endpoints (all require a student session)

| Method | Path | Returns |
|---|---|---|
| GET | `/teachers?search=` | `{teachers:[{id,name,subjects,bio,hourly_rate,availability:[{day,start,end}]}]}` — `day` is `"Monday"`…, times `HH:MM` |
| GET | `/teachers/:id` | `{teacher:{…same shape}}` |
| POST | `/bookings` | 201 `{booking:{id,status,amount,created_at,date,start_time,end_time,teacher:{id,name}}}` — server computes `amount` from the teacher's hourly rate × duration in IST (`Asia/Kolkata`); 400 outside availability, 409 overlapping slot |
| GET | `/bookings/mine` | `{bookings:[…]}` |
| POST | `/payments/order` | `{key_id, order_id, amount, currency}` — Razorpay checkout params; requires booking status `approved`; 503 while Razorpay keys are missing |
| POST | `/payments/verify` | `{payment}` — verify handler response with `razorpay_order_id/payment_id/signature` |
| POST | `/payments/webhook` | server-only (`X-Razorpay-Signature`) |
| GET | `/payments/mine` | `{payments:[{id,booking_id,amount,currency,status,provider,provider_order_id,provider_transaction_id,created_at}]}` — success status is `"succeeded"` |
| GET | `/sessions/mine` | `{sessions:[{id,booking_id,teacher:{id,name},date,started_at,ended_at,duration_minutes,attendance_count,meeting_url,recording_url,recording_consent}]}` — join link is `meeting_url` (not `zoom_link`) |
| GET | `/chat/messages?room=global` | `{messages:[{id,sender_id,sender_name,room,content,created_at}]}` (students only, newest last, 50) |
| POST | `/feedback` | 201 `{feedback}` — `{booking_id, rating:1-5, testimony_text, allow_display}`; booking must be `completed`; duplicate feedback 409 |
| GET | `/feedback/mine` | `{feedback:[…]}` |

Booking lifecycle: `pending → approved (teacher) → paid (after payment) → completed (after class)`; `rejected` also possible.

## Realtime (Socket.IO)

Connect with `io(URL, { withCredentials: true, transports: ['websocket'] })` against the API origin (same cookie). No auth payload needed — the server resolves the session itself.

Student events: room `global` is joined automatically on connect; the server emits `chat:ready`. Send `chat:message {room:"global", content}` (1–500 chars); broadcast is `chat:message:new`; errors arrive on `chat:error`. Age 10–12 students are censored server-side before broadcast.
