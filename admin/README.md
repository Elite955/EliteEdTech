# EdTech Admin

The admin web application is a React, TypeScript, and Vite client. The API and database setup are documented in the repository-root [README](../README.md); follow those steps first to configure `.env`, initialize PostgreSQL, and start the backend.

## Run the admin client

From the repository root, install the client dependencies and start Vite:

```powershell
Set-Location admin
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and Socket.IO requests to the local API on port `4000`.

## Checks

Run these commands from the `admin` directory:

```powershell
npm run build
npm run lint
```

Run backend tests from `backend` with `npm test`.

## Authentication and configuration

All roles use the shared sign-in page. Administrator accounts must enroll an authenticator app on first sign-in and provide a one-time code on later sign-ins. Student and teacher routes currently lead to placeholder workspaces.

Super Admins can review active sessions across accounts, including sign-in time, last authenticated API activity, expiry, IP address, and browser/device details recorded at sign-in. Ended and expired sessions are not shown. An unexpired session may be idle. Viewing and revoking a session is audited; the current Super Admin session cannot be revoked from this page.

Keep credentials and provider secrets in the backend's root `.env` file. Never add secrets to the client or commit `.env`. The Integrations screen reports test-mode readiness only; it never displays secret values.

The admin summary can be downloaded as PDF or XLSX. Razorpay full refunds accept only test keys (`rzp_test_`) with `RAZORPAY_TEST_MODE=true`; Twilio sends only through the WhatsApp sandbox to numbers in `TWILIO_TEST_RECIPIENTS`; Zoom meeting creation requires `ZOOM_TEST_MODE=true` and a dedicated test account. These actions are disabled outside `development`/`test` and are never called during setup or automated tests. Do not enable test flags in production. Backup execution and user impersonation remain disabled until their policies are approved.
