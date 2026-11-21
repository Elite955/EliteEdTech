# EdTech Platform

A web-based, one-to-one tutoring platform where students find teachers, request class times, and pay for approved bookings. The platform also supports live classes, attendance and session history, feedback, and a moderated student chat.

## Team and ownership

| Team member | Role | Owns |
|---|---|---|
| Bhuvan | Admin | `shared/`, `backend/`, `admin/`, `docs/`, and `TASKS.md` |
| Ashish | Teacher | `teacher/` |
| Vinay | Student | `student/` |

Keep changes within your ownership area. The shared database schema and API contract are maintained by Bhuvan; teacher and student features should consume that contract rather than changing it.

## Product scope

- **Students:** browse teacher profiles, request available class slots, view bookings and payment/session history, chat, and submit feedback.
- **Teachers:** manage profiles, subjects, hourly rates and availability; review booking requests; conduct classes; view attendance, session logs, and student feedback.
- **Admins:** manage users and permissions, bookings, payments, chat moderation, recordings and reports, and promotional links.
- **Platform services:** role-based registration and sign-in, MFA, encrypted sensitive data, single-active-session enforcement, audit logging, notifications, and a central database.

Live-class and payment integrations must be selected by the team and use test/sandbox credentials during development. Recordings require participant consent. Chat must apply the agreed age-appropriate protections for students aged 10–12.

## Repository layout

```text
EDtech-Repo/
├── shared/       # Database schema and API contract reference
├── backend/      # Authentication, security, database, payments, notifications
├── home/         # Public marketing site
├── admin/        # Admin console
├── teacher/      # Teacher portal, including self-registration
├── student/      # Student portal
├── docs/         # Architecture and project documentation
└── README.md
```

Add folders as work begins; do not commit empty placeholders. See `TASKS.md` for feature details, ownership boundaries, and completion criteria.

## Development workflow

1. Select an issue from the repository's project board and assign one owner.
2. Create a role-prefixed branch: `admin/short-description`, `teacher/short-description`, or `student/short-description`.
3. Make focused commits and test the changes.
4. Open a pull request targeting `main`; start the title with `[admin]`, `[teacher]`, or `[student]`, and include `Closes #<issue-number>` in the description.
5. Request a review and merge only after approval and testing. Do not push unfinished work directly to `main` or force-push to it.
6. Move the issue to **Done** after the pull request is merged.

## Configuration and security

- Never commit API keys, passwords, database credentials, or real payment details.
- Store local secrets in an untracked `.env` file and document required variable names in a sanitized example/reference.
- Use payment sandbox mode only; do not process real charges during development.
- Do not record a class without consent, and do not expose recordings when consent was not given.

## Admin application (development)

The web app uses **React + TypeScript + Vite**, **Node.js + Express**, and **PostgreSQL**. Students and teachers register through their own portals, while administrator accounts are created with the bootstrap seed and in the admin console. Each role signs in to its own workspace. Demo seed credentials are documented for local development only.

1. Install Node.js 22 or later and PostgreSQL. Create a local database named `edtech_admin`.
2. From the repository root, run `Copy-Item .env.example .env`. Set `DATABASE_URL`, `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters), and the bootstrap admin name and email. Generate random signing and encryption keys in PowerShell:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Put the first value in `JWT_SECRET` and the second in `FIELD_ENCRYPTION_KEY`. Keep `.env` private and untracked.
3. Install and initialize the API:

   ```powershell
   Set-Location backend
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

4. In additional terminals, start the public site and each portal:

   ```powershell
   Set-Location home; npm install; npm run dev
   Set-Location ..\teacher; npm install; npm run dev
   Set-Location ..\student; npm install; npm run dev
   Set-Location ..\admin; npm install; npm run dev
   ```

   Or run `.\start-dev.ps1` from the repository root to start all of them.

   Open the appropriate URL:

   | App | URL | Sign-in |
   |---|---|---|
   | Public site | `http://localhost:5170` | Links to the portals |
   | Teacher portal | `http://localhost:5174` | Seed account `teacher1@edtech.test` / `Teach@123456`, or create an account at `/register` |
   | Student portal | `http://localhost:5175` | Seed account `student@edtech.test` / `Student@12345`, or register at `/register` |
   | Admin console | `http://localhost:5173` | Bootstrap admin from `.env`; enroll an authenticator app on first sign-in |

The API listens on port `4000`. Vite proxies `/api` and Socket.IO during development. The browser session uses a role-specific HttpOnly cookie; only one active session is retained per administrator. Password reset email requires configured SMTP. Provider readiness is shown in **Integrations**; credentials are read from server environment variables and are never shown in the UI.

The current implementation provides separate student, teacher, and admin portals with role-specific sign-in, teacher and student self-registration, admin MFA, password reset, session revocation, server-side role/permission checks, dashboard aggregates, user and admin-account management, booking and class workflows, in-portal meeting joins, a live shared math whiteboard, audit logging, CSV user exports, platform settings, and operational record views/status changes. A migrated and seeded database is required for sign-in; empty states are not demo data.

Booking requests and teacher approvals send student email and WhatsApp notifications with a link to the student portal, not a direct meeting URL. For an offline bank transfer, a Super Admin or Finance Admin can use **Bookings → Record bank transfer** after verifying receipt; a transaction reference is required, the action is audited, and duplicate references are rejected. This records the payment and creates a scheduled class session. Select the meeting provider with `MEETING_PROVIDER`. In development/test, `MEETING_PROVIDER=jitsi` with `JITSI_TEST_MODE=true` creates a unique room URL on public `meet.jit.si` without OAuth credentials; the room starts when someone opens it, and anyone with the link may join. The first participant may need to authenticate or wait for a moderator, so the teacher should join first. Audio/video is handled by the public Jitsi service, embedded beside the live math whiteboard in both portals. The teacher draws, erases, and clears the board; the student sees the live updates in view-only mode. To show the board to Jitsi attendees, the teacher can open the board-only tab from the class dialog, then use Jitsi's **Share screen** control to select that tab; the browser will ask for explicit permission. Board state is temporary, participant-checked, held in backend memory, and expires after three hours without activity or a backend restart; it is not saved as class notes. Teachers can open paid scheduled sessions before their start time to prepare; students remain limited to joining at the scheduled start time. Alternatively, Google Meet requires OAuth credentials and `GOOGLE_MEET_TEST_MODE=true`. Email and WhatsApp credentials are separate; without them the payment and meeting link are still recorded, but notifications cannot be delivered. Use **Meeting checks** to retry after configuration. Booking email delivery is restricted to development/test recipients in `BOOKING_EMAIL_TEST_RECIPIENTS`; WhatsApp remains behind its sandbox configuration. Existing saved Zoom links remain unchanged. Set `PORTAL_ORIGIN` to the student portal origin when creating notification links.

Administrator summary reports can be downloaded as PDF or XLSX and contain aggregate operational counts, not account-level personal data. Full Razorpay refunds are supported only for existing succeeded INR payments with a `rzp_test_` key and `RAZORPAY_TEST_MODE=true`; partial refunds, payment creation, and live credentials are not supported. Twilio WhatsApp test messages require `TWILIO_SANDBOX_MODE=true`, the Twilio sandbox sender, and an explicit E.164 `TWILIO_TEST_RECIPIENTS` allowlist. Google Meet test-space creation requires `GOOGLE_MEET_TEST_MODE=true` and a connected Google account; it is disabled unless `NODE_ENV` is `development` or `test`. Google Meet has no API sandbox, so test mode still creates a real space. Configure credentials only in the ignored `.env` file and do not enable test flags in production. Provider calls are not made by setup or tests.

To configure Google Meet, set `MEETING_PROVIDER=google_meet`, enable the Google Meet REST API in a Google Cloud project, create an OAuth client, and authorize it with the `https://www.googleapis.com/auth/meetings.space.created` scope. Set `GOOGLE_MEET_CLIENT_ID`, `GOOGLE_MEET_CLIENT_SECRET`, and `GOOGLE_MEET_REFRESH_TOKEN` in the backend environment, then set `GOOGLE_MEET_TEST_MODE=true` for development/test. Use a dedicated test Google account because API-created spaces are real. For public Jitsi testing, set `MEETING_PROVIDER=jitsi` and `JITSI_TEST_MODE=true` instead; this only works in development/test and does not call an external API to create the room. Never share OAuth secrets in chat or commit them to the repository.

The public `meet.jit.si` service may require the first participant to authenticate or wait for a moderator. See the [Jitsi user guide](https://jitsi.github.io/handbook/docs/user-guide/user-guide-start-a-jitsi-meeting/) for current joining behavior. For production, use a hosted or self-managed Jitsi deployment with an appropriate access-control policy rather than relying on public room URLs.

Bulk notifications, backup execution, and user impersonation remain disabled. Backup storage and retention must be approved before backups are enabled. Password-reset email still requires configured SMTP. Provider operations are permission-checked, and uncertain provider outcomes are recorded as unknown rather than retried automatically.

## Planning

Track work through GitHub Issues and the repository's project board. Each issue should have one owner, a clear outcome, and acceptance criteria. Confirm open technology and integration choices with the team before implementation.
