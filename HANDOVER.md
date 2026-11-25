# Handover — ELITE EdTech platform

## Repository state

- Repo: `Elite955/EliteEdTech` (public), default branch `main`
- Local branch `UI.v2` is in sync with `main` at commit `5588c4e`
- Working tree is clean; everything is pushed
- **Never commit `.env` or any API keys.** `.gitignore` excludes `.env` and `.env.*`
- The public repo contains no passwords or live secrets

## What is deployed

| Component | Location |
|---|---|
| API + Socket.IO | https://edtech-api-bvir.onrender.com |
| Student portal | https://elite-ed-tech-student.vercel.app |
| Teacher portal | https://elite-ed-tech.vercel.app |
| Admin portal | https://elite-ed-tech-admin.vercel.app |
| Marketing home | https://elite-ed-tech-home.vercel.app |
| Database | Neon, project `ep-royal-king-biuzlwcn` (ap-southeast-1), 24 tables |

The four Vercel projects build from the same repo, each with its own root directory
(`student`, `admin`, `teacher`, `home`), and proxy `/api` + `/socket.io` to Render through
`vercel.json`. Frontends must **not** set `VITE_API_URL` (relative `/api` is deliberate).

A GitHub Actions workflow (`.github/workflows/keep-alive.yml`) pings `/api/health`
every 10 minutes so Render's free tier stays warm.

## Current integrations status

```
GET https://edtech-api-bvir.onrender.com/api/integrations/status

payments: razorpay=true, testMode=true, webhook=true
meetings: provider=jitsi, jaas=false
email:    configured=true, provider=brevo
```

## Working features

- Registration, MFA enrollment (first sign-in shows a QR), role-based portals
- Booking with server-side pricing: `hours × teacher's rate on the availability slot`,
  rate constrained to ₹0–₹4,999
- Teacher approves/rejects; approval pre-creates a Jitsi room, hidden until payment
- Razorpay test payments (`payment.captured` webhook is the fallback path)
- On payment: booking becomes paid, Jitsi link revealed, PDF receipt generated
- Receipt download in Payment History; welcome email with PDF bill + instructions
- Email via Brevo HTTPS API (Render blocks SMTP ports on the free tier)
- Live chat via Socket.IO (direct connection to Render with a short-lived token;
  Vercel rewrites cannot proxy WebSockets)
- Teacher/admin can cancel or end a class; admin can delete classes/recordings
- Dated availability calendar with quick-pick dates; students can pick any start
  time and class length inside the teacher's window; joining is allowed 15 min
  early and at any time after the slot
- Free browser recording (screen + mic) stored as BYTEA in Neon, 25 MB cap,
  exposed through `/api/sessions/:id/recording/file` to paid participants

Verification: 21/21 backend tests pass; all four frontends build.

## Remaining manual work (all external, no code needed)

### 1. Email sender verification — REQUIRED for email to work

Brevo's API key is set, but the sender must be verified:

1. https://app.brevo.com/settings/senders → add and verify a sender address
2. Render → `edtech-api` → Environment → set `SMTP_FROM` to that exact address
   (format `ELITE <verified@example.com>`)
3. Redeploy; test by registering a new account — the welcome email should record `sent`

### 2. Razorpay webhook — confirm in the dashboard

The secret is configured on Render and the endpoint is verified. Confirm the
dashboard entry at https://dashboard.razorpay.com/app/webhooks:

- URL: `https://edtech-api-bvir.onrender.com/api/payments/webhook`
- Event: `payment.captured`
- Secret must match Render's `RAZORPAY_WEBHOOK_SECRET`

Then do a test payment and close the tab immediately; the booking should still
become paid.

### 3. Go-live (client-owned, only when ready)

- Complete Razorpay KYC on **the client's** account (money must settle to them)
- Generate live `rzp_live_…` keys and a separate live webhook secret
- On Render replace `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`, and set `RAZORPAY_TEST_MODE=false`
- Run one small live transaction, refund it manually in the dashboard
- Admin refunds are intentionally disabled outside test mode

### 4. Optional: automatic teacher moderator

Public `meet.jit.si` requires the first person to log in with Google/GitHub/Facebook
to become moderator. The app cannot bypass this. For automatic moderator rights,
sign up for the free JaaS Dev plan (https://jaas.8x8.vc, 25 users/month) and set:

```
JAAS_APP_ID, JAAS_API_KEY_ID, JAAS_PRIVATE_KEY
```

on Render. The code already issues a JWT with `moderator:true` for teachers.
Check `/api/integrations/status` → `meetings.jaas` becomes `true`.
If JaaS is not used, the teacher must log in inside Jitsi once per room.

### 5. Legal / operational

- Get written parental consent before recording minors (India DPDP Act)
- Vercel Hobby is non-commercial; a tutoring business needs Pro ($20/mo)
- Render free sleeps; keep the Actions workflow enabled
- Neon free tier is 0.5 GB; recordings count toward it (about 20 × 25 MB files)

## Accounts

The live and local databases contain exactly three demo accounts:
`admin@elite.test`, `student@elite.test`, `teacher@elite.test`.
Passwords were shared out of band — rotate them before handing access to anyone
new, since they have appeared in chat history.

To reset to a clean demo state: truncate all public tables on both databases,
run `npm run db:migrate`, `npm run db:seed` (with `BOOTSTRAP_ADMIN_*` env vars),
then `node scripts/demo-accounts.mjs`.

## Documentation

- `DEPLOY.md` — full setup, webhook, email, JaaS, recording, and go-live runbooks
- `README.md`, `admin/README.md`, `shared/api-contract.md` — project background

## Run / stop locally

```
./run-local.sh
./stop-local.sh [--with-db]
```

Ports: API 4000, home 5170, admin 5173, teacher 5174, student 5175.
API `/` returns 404 by design — use `/api/health`.
