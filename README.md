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
├── shared/       # Database schema, API contract, shared environment-variable reference
├── backend/      # Authentication, security, database, payments, notifications
├── admin/        # Admin dashboard
├── teacher/      # Teacher dashboard
├── student/      # Student dashboard
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

The web app uses **React + TypeScript + Vite**, **Node.js + Express**, and **PostgreSQL**. Students, teachers, and administrators use one shared sign-in page; successful sign-in routes each role to its own workspace. Admin accounts are created with the bootstrap seed, while student and teacher accounts are created by an administrator. There are no hard-coded demo credentials.

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

4. In a second terminal, start the admin app:

   ```powershell
   Set-Location admin
   npm install
   npm run dev
   ```

   Open `http://localhost:5173`. Admins enroll an authenticator app on first sign-in and use its one-time code on later sign-ins. Student and teacher accounts use their own email/password and are routed to their role-specific placeholder pages.

The API listens on port `4000`, the admin app on `5173`, and Vite proxies `/api` and Socket.IO during development. The browser session uses an HttpOnly cookie; only one active session is retained per administrator. Password reset email requires configured SMTP. Provider readiness is shown in **Integrations**; credentials are read from server environment variables and are never shown in the UI.

The current implementation provides shared student/teacher/admin sign-in, admin MFA, password reset, session revocation, server-side role/permission checks, dashboard aggregates, student/teacher and admin-account management, role management, audit logging, global authorized search, CSV user exports, platform settings, and operational record views/status changes. Student and teacher accounts currently land on role-specific placeholder pages; their full learning and teaching workspaces are not implemented. A database is required for live records; empty states are not demo data.

Administrator summary reports can be downloaded as PDF or XLSX and contain aggregate operational counts, not account-level personal data. Full Razorpay refunds are supported only for existing succeeded INR payments with a `rzp_test_` key and `RAZORPAY_TEST_MODE=true`; partial refunds, payment creation, and live credentials are not supported. Twilio WhatsApp test messages require `TWILIO_SANDBOX_MODE=true`, the Twilio sandbox sender, and an explicit E.164 `TWILIO_TEST_RECIPIENTS` allowlist. Zoom meeting creation requires `ZOOM_TEST_MODE=true` and a dedicated test account. All three actions are disabled unless `NODE_ENV` is `development` or `test`; configure test credentials only in the ignored `.env` file and do not enable these flags in production. Provider calls are not made by setup or tests.

Bulk notifications, backup execution, and user impersonation remain disabled. The WhatsApp action sends one message at a time; it does not support bulk delivery. Backup storage and retention must be approved before backups are enabled. Password-reset email still requires configured SMTP. Provider operations are rate-limited, permission-checked, and audited; uncertain provider outcomes are recorded as unknown rather than retried automatically.

## Planning

Track work through GitHub Issues and the repository's project board. Each issue should have one owner, a clear outcome, and acceptance criteria. Confirm open technology and integration choices with the team before implementation.
