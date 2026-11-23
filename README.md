# EdTech Platform

A four-app one-to-one tutoring platform: students browse approved teachers, request slots, pay through Razorpay test mode, join live classes, use a moderated global chat, and submit feedback. Teachers manage availability, approve/reject bookings, conduct classes, and view feedback. Admins manage users, roles, bookings, payments, chat moderation, notifications, integrations, and reports.

## Repository layout

| Path | Purpose | Port |
|---|---|---:|
| `home/` | Public marketing site | 5170 |
| `student/` | Student portal | 5175 |
| `teacher/` | Teacher portal | 5174 |
| `admin/` | Admin console | 5173 |
| `backend/` | Express API, PostgreSQL, Socket.IO | 4000 |
| `shared/api-contract.md` | Current HTTP and Socket.IO contract | — |

## Stack

- Frontend: React + Vite. Student is JavaScript; teacher/admin are TypeScript.
- Backend: Node.js, Express 5, PostgreSQL (`pg`), Socket.IO, Zod validation, JWT session cookies.
- Security: role-specific HttpOnly cookies, TOTP MFA, AES-256-GCM field encryption, append-only audit log, permission matrix.
- Payments: Razorpay test-mode orders, verification, webhook, full refunds.
- Meetings: Jitsi test rooms or Google Meet spaces; existing Zoom links remain readable.
- Notifications: Nodemailer SMTP and Twilio WhatsApp sandbox with dev/test allowlists.

## Local setup

Requirements: Node.js 22+, PostgreSQL, npm.

1. Copy the environment template and fill in the required values:

   ```powershell
   Copy-Item .env.example .env
   ```

   Generate secrets:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Put the first value in `JWT_SECRET` and the second in `FIELD_ENCRYPTION_KEY`. `BOOTSTRAP_ADMIN_PASSWORD` must be at least 12 characters. Never commit `.env`.

2. Install and initialize the API:

   ```powershell
   Set-Location backend
   npm install
   npm run db:migrate
   npm run db:seed
   ```

3. Start everything from the repository root:

   ```powershell
   .\start-dev.ps1
   ```

   Or start each app manually with `npm run dev` inside `backend`, `home`, `student`, `teacher`, and `admin`.

   `start-dev.ps1` installs missing dependencies automatically. If PostgreSQL is not already listening on port 5432, set `PG_CTL`, `PGDATA`, and optionally `PG_LOG_FILE` to your local installation; the script will otherwise look for PostgreSQL under your user profile. On Linux/macOS, `run-local.sh` accepts `PG_BIN_DIR`, `NODE_BIN_DIR`, `PGDATA`, and `PGSOCK` overrides. Vite proxies use `API_PROXY_TARGET` when set, so non-local API hosts are supported.

4. Open the apps:

   | App | URL | Demo sign-in |
   |---|---|---|
   | Public site | http://localhost:5170 | — |
   | Student portal | http://localhost:5175 | `student@edtech.test` / `Student@12345` |
   | Teacher portal | http://localhost:5174 | `teacher1@edtech.test` / `Teach@123456` |
   | Admin console | http://localhost:5173 | Bootstrap admin from `.env` |
   | API health | http://localhost:4000/api/health | — |

The API health endpoint checks the database. First-time users in every role enroll an authenticator app; later sign-ins require a one-time code.

## Environment variables

Backend variables are read from the root `.env` by `backend/src/config.js`.

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `API_PORT` | Runtime mode and API port |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `FIELD_ENCRYPTION_KEY` | Session signing and AES field encryption |
| `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | First super admin |
| `ADMIN_ORIGIN`, `TEACHER_ORIGIN`, `STUDENT_ORIGIN`, `HOME_ORIGIN` | CORS and notification links |
| `PORTAL_ORIGIN` | Fallback portal origin for notifications |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Password reset and booking email |
| `BOOKING_EMAIL_TEST_RECIPIENTS` | Comma-separated dev/test email allowlist |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | WhatsApp sandbox |
| `TWILIO_SANDBOX_MODE`, `TWILIO_TEST_RECIPIENTS` | Sandbox gating and E.164 recipient allowlist |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay test credentials |
| `RAZORPAY_TEST_MODE` | Must be `true` for payments/refunds in dev/test |
| `MEETING_PROVIDER` | `jitsi` or `google_meet` |
| `JITSI_TEST_MODE` | Enables public `meet.jit.si` test rooms in dev/test |
| `GOOGLE_MEET_CLIENT_ID`, `GOOGLE_MEET_CLIENT_SECRET`, `GOOGLE_MEET_REFRESH_TOKEN`, `GOOGLE_MEET_TEST_MODE` | Google Meet OAuth |

Frontend variables can be set in each app's `.env.local` or in Vercel project settings:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API origin, e.g. `https://api.example.com`; leave empty for Vite proxy |
| `VITE_SOCKET_URL` | Socket.IO origin, e.g. `wss://api.example.com`; leave empty for Vite proxy |
| `VITE_STUDENT_PORTAL_URL` | Student portal origin used by the home/teacher/admin apps |
| `VITE_TEACHER_PORTAL_URL` | Teacher portal origin used by the home/student/admin apps |

## Main flows

### Authentication

- `POST /api/auth/register` creates student or teacher accounts, with different required fields per role.
- `POST /api/auth/login` is portal-aware; a student account cannot sign in through the teacher portal.
- Students, teachers, and admins complete TOTP enrollment or verification.
- Each login revokes the previous active session for that user.
- Auth routes are rate-limited per IP, email, and portal.
- Cookies are `edtech_student_session`, `edtech_teacher_session`, and `edtech_admin_session`.

### Booking, payment, and class

1. Student selects an availability window and requests a slot.
2. Teacher approves or rejects the request.
3. Student pays through Razorpay checkout; verification marks the booking `paid` and creates a class session.
4. Meeting links are created lazily: teachers may prepare them before the start time; students can join from the scheduled start time.
5. Teacher starts and ends the session; attendance and recording links can be recorded.
6. After completion, the student can submit feedback.

### Chat and whiteboard

- Students and teachers join the `global` room automatically on Socket.IO connect.
- Teacher messages are tagged as `Teacher`; student messages are tagged as `Student`.
- Messages are stored, moderated, and censored server-side for ages 10–12.
- Admins with chat moderation permission see messages live in the console and can hide or delete them.
- Teachers and students in a paid active class can share a live whiteboard. Teachers draw; students view. Board state is temporary backend memory and expires after three hours idle.

### Admin

Admin roles are seeded as Super Admin, Operations Admin, Finance Admin, Support Admin, and Moderator. Permissions are checked server-side. The console includes dashboards, user directories, active sessions, roles/permissions, meeting checks, test notification tools, Razorpay test refunds, bank-transfer recording, reports, and module records.

## Vercel deployment

The four frontend apps are static Vite builds and each includes a `vercel.json` with SPA rewrites. Create one Vercel project per app:

| Vercel project | Root Directory | Build Command | Output Directory |
|---|---|---|---|
| edtech-home | `home` | `npm run build` | `dist` |
| edtech-student | `student` | `npm run build` | `dist` |
| edtech-teacher | `teacher` | `npm run build` | `dist` |
| edtech-admin | `admin` | `npm run build` | `dist` |

Set the `VITE_*` variables listed above in each project. The API backend is a long-running Express + Socket.IO service with a PostgreSQL pool; deploy it to a Node host such as Render, Railway, or Fly.io, then set `VITE_API_URL`/`VITE_SOCKET_URL` in Vercel and the four `*_ORIGIN` variables on the API. Static Vercel projects do not host the Express/Socket.IO server.

Do not enable production payment or notification test flags. Razorpay refunds, Jitsi links, Google Meet test spaces, and Twilio sandbox messages are restricted to development/test configuration.

## Checks

```powershell
Set-Location backend; npm test
npm run test:flow
Set-Location ..\admin; npm run lint; npm run build
Set-Location ..\teacher; npm run lint; npm run build
Set-Location ..\student; npm run build
Set-Location ..\home; npm run build
```

See `shared/api-contract.md` for endpoint and event details.
