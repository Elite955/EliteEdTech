# EDTECH — Student Dashboard (Vinay)

Student SPA for the one-to-one tutoring platform. **Owned by Vinay.** This app is a
consumer of the backend API — it contains no backend logic and does not modify
`shared/`, `backend/`, `admin/`, `teacher/`, `docs/`, or `TASKS.md`.

## Run

```bash
cd student
npm install
npm run dev      # http://localhost:5175 (strict port)
npm run build    # production build check
```

Ports per ownership table: Student **5175** · Admin 5173 · Backend API 4000.
The Vite dev server proxies `/api` and `/socket.io` to `http://localhost:4000`, so no
CORS setup is needed in development. Override with `VITE_API_URL` / `VITE_SOCKET_URL`.

## Implemented modules (TASKS.md §5)

| Module | Where |
|---|---|
| Browse Teachers (search, subjects, bio, hourly rate, availability preview) | `src/pages/BrowseTeachers.jsx` |
| Request Class Timing (teacher → availability → slot request) | `src/pages/RequestSlot.jsx` |
| My Bookings (live status, **Pay now** via Razorpay checkout) | `src/pages/MyBookings.jsx` |
| Payment History (Razorpay receipts/status) | `src/pages/PaymentHistory.jsx` |
| Session History (attendance, duration, Zoom link, recording **only with consent**) | `src/pages/SessionHistory.jsx` |
| Global Live Chat (Socket.IO pub-sub) | `src/pages/Chat.jsx` |
| Age-censored chat for ages 10–12 (**content filter only**, per decision) | `src/context/AuthContext.jsx` + `src/pages/Chat.jsx` |
| Testimony / Feedback (rating + text, optional promo display) | `src/pages/Feedback.jsx` |
| Sign-in with MFA (QR enrollment on first login) + single-session auto-invalidation | `src/pages/Login.jsx` |

Decisions recorded in Step 0 (this session): PostgreSQL · Node.js + Express · React ·
**Zoom** · Razorpay **test mode** · Nodemailer + Twilio sandbox · Socket.IO · censor =
content filter only for ages 10–12 · student SPA 5175.

---

## API CONTRACT (reconciled)

The app now follows the real contract in `../shared/api-contract.md`. Summary of the
reconciliation that was applied to this app (backend was extended by Vinay under the
user's explicit override of the ownership rule; changes are reported for Bhuvan's review):

- Auth is a **cookie session** (`edtech_session`, HttpOnly) — every request uses
  `credentials: 'include'`. No Bearer tokens, no localStorage tokens.
- Login returns `{user, permissions}` (no MFA) or `{requiresMfaSetup, challenge, otpAuthUrl}`
  (first student login — QR rendered with `qrcode.react`) or `{requiresMfa, challenge}`
  (returning logins → `POST /auth/mfa/verify`).
- Enrollment uses `POST /auth/mfa/confirm` (first login) vs `POST /auth/mfa/verify` (later logins).
- There is no ALREADY_SIGNED_IN 409 — the backend silently invalidates the previous session.
- Errors are `{ error: "message" }` (status text is never displayed).
- Password minimum is 12 characters (Register + Login enforce it).
- Response wrappers: `{teachers|bookings|payments|sessions|messages|feedback: [...]}` —
  pages unwrap the named key, not the bare array.
- Payments order → `{key_id, order_id, amount, currency}` (`order_id`, not `razorpay_order_id`);
  payment history rows use `created_at`, `provider_order_id`, `provider_transaction_id`,
  and status `"succeeded"`.
- Sessions expose `meeting_url` (not `zoom_link`); recordings only when
  `recording_consent` is true and `recording_url` exists.
- Socket.IO connects with `{ withCredentials: true, transports: ['websocket'] }` — no
  auth payload; the server resolves the session cookie. No `chat:join` — the student is
  auto-joined to `global` and receives `chat:ready`; server-side censoring for ages 10–12
  (banner driven by `user.age` client-side).
- Rate limiting on auth routes is currently disabled (user decision; revisit before production).
