# EDTECH PLATFORM — TEAM TASK DIVISION (TASKS.md)

> **This file is written for an AI agent / developer.** It describes the complete project, divides
> all work between three team members, and enforces a strict ownership model so there are
> **zero merge conflicts** when pushing to Git.

---

## ⛔ STEP 0 — IDENTITY GATE (MANDATORY — DO THIS FIRST, EVERY SESSION)

Before doing **ANY** work, you (the agent) **MUST** ask the user:

> **"Who are you? Please pick one:**
> **1. Bhuvan — Admin** (dashboard, backend core, security, payments, notifications)
> **2. Ashish — Teacher** (availability, booking queue, conducting classes, feedback)
> **3. Vinay — Student** (browsing teachers, slot booking, chat, payment history)"

**Rules:**
1. Do not read, build, or modify anything until the user answers.
2. Only proceed with the section matching the user's identity.
3. NEVER build another member's section, even if they ask. Tell them to run their own agent session instead.
4. If the user is unsure, describe the three roles from Section 2 and ask again.

### After the identity is known — ask these OPEN REQUIREMENT questions

These decisions are intentionally left open. Ask the user and record their answers before building:

| # | Open question | Default if user says "you decide" |
|---|---|---|
| 1 | Which database? (MongoDB / PostgreSQL / Firebase) | MongoDB |
| 2 | Which backend framework? (Node.js + Express / Next.js API routes) | Node.js + Express |
| 3 | Frontend framework? (plain HTML/CSS/JS / React) | React |
| 4 | Live classes: **Google Meet** or **Zoom**? (links are generated per session) | Google Meet |
| 5 | Payment gateway: Razorpay in **test mode** or live keys? | Test mode |
| 6 | Notification provider for WhatsApp & Email (e.g., Twilio, Meta API, Nodemailer/SMTP) | Nodemailer (email) + Twilio sandbox (WhatsApp) |
| 7 | Real-time chat transport (Socket.IO / native WebSockets) | Socket.IO |
| 8 | Chat age-censor scope: content filter only for ages **10–12**, or stricter rules (no links, no images) too? | Filter + no links/no images for 10–12 |
| 9 | Port / local URL the user wants for this member's service | See ownership table |

---

## 1. PROJECT OVERVIEW

**"EDTECH PLATFORM"** — a web-based, **one-to-one (1-on-1)** tutoring platform where:

- **Students** book **hourly-charged** slots with teachers.
- Teachers set availability; students request class timings; the teacher approves.
- Approved bookings are paid via **Razorpay** (payment gateway), then confirmed.
- Live classes happen on **Google Meet or Zoom** (agent asks which — see Step 0).
- Every session has **attendance & session logs**, and **recordings are made only with consent**.
- Students get a **live chat community** (global chat) built on a **publish–subscribe model**.
- Chat is **age-censored for students aged 10, 11, 12**.
- Sign-in is protected by **MFA / authenticator app**, stored secrets are **encrypted**,
  and a signed-in user **cannot sign in elsewhere at the same time** (single active session).
- Everything is logged for **cyber/security auditing** (device, ID, features accessed, duplicate sign-ins).
- Admin manages users (add/block), bookings, payments, recordings, reports, permissions,
  and **social-media promotion** links.
- All three roles write into a **Central Database** and follow one **API contract**.

### Role → Person mapping (fixed, never change)

| Person | Role |
|---|---|
| **Bhuvan** | **ADMIN** (also owns all shared core) |
| **Ashish** | **TEACHER** |
| **Vinay** | **STUDENT** |

---

## 2. OWNERSHIP MAP — ZERO MERGE CONFLICTS

Each member touches **ONLY** their own folders/files. This is the single most important rule.

### Folder ownership

```
edtech-platform/
├── shared/                  ← OWNED BY BHUVAN ONLY (contract files, read-only for others)
│   ├── schema.md            ← Central DB schema (single source of truth)
│   ├── api-contract.md      ← All REST/Socket endpoints & payloads
│   └── env.example.md       ← Shared env var names
├── backend/                 ← OWNED BY BHUVAN ONLY
│   ├── auth/                ← Registration, login, MFA, single-session, encryption
│   ├── security/            ← Cyber logging, device fingerprinting, testing
│   ├── payments/            ← Razorpay integration & webhooks
│   ├── notifications/       ← WhatsApp/Email + publish-subscribe broker
│   └── db/                  ← Central Database models & seeds
├── admin/                   ← OWNED BY BHUVAN ONLY (Admin dashboard SPA)
├── teacher/                 ← OWNED BY ASHISH ONLY (Teacher dashboard SPA + availability/queue logic)
├── student/                 ← OWNED BY VINAY ONLY (Student dashboard SPA + chat/booking UX)
├── docs/                    ← OWNED BY BHUVAN ONLY
└── TASKS.md                 ← OWNED BY BHUVAN ONLY (this file)
```

### Port ownership (prevents local clashes)

| Member | Port(s) |
|---|---|
| Bhuvan | Backend API `4000`, Admin SPA `5173` |
| Ashish | Teacher SPA `5174` |
| Vinay | Student SPA `5175` |

### Git rules (write them into the repo CONTRIBUTING note if asked)

1. Every member works on their **own branch**: `admin/*` (Bhuvan), `teacher/*` (Ashish), `student/*` (Vinay).
2. Never commit files outside your ownership folders. Not "just one small fix" — ask the owner in person instead.
3. `shared/`, `backend/`, `admin/`, `TASKS.md`, `docs/` are **Bhuvan's**. Ashish and Vinay **consume** the API contract read-only.
4. PRs target `main`; PR title must start with your role prefix: `[admin]`, `[teacher]`, `[student]`.
5. One person reviews each PR: Bhuvan reviews all core/shared; Ashish & Vinay review only their own areas to each other.
6. No force-push to `main`, ever.

### Workload summary (equal spread)

| Member | Main-content items | Additional-feature items |
|---|---|---|
| Bhuvan (Admin) | Central DB, auth+MFA+authenticator, encrypted storage, single-session lock, payments (gateway), notifications+pub-sub, admin dashboard modules, recording & reports | cyber logging/testing, add/block users, chat moderation + censor engine, social-media promotion, security |
| Ashish (Teacher) | Set availability, hourly charge config, booking queue (view/accept/reject), conduct classes (Meet/Zoom), session logs | view student feedback/testimony, consent-based recording control |
| Vinay (Student) | Browse teachers, request class timing (slot booking), my bookings, payment history, session history | global live chat community UI, age-10–12 censored chat, testimony/feedback submission |

---

## 3. BHUVAN — ADMIN (you are Bhuvan only if the user said so)

You own the **entire backend**, the **shared contracts**, and the **Admin dashboard**.

### 3.1 Shared contracts (build these FIRST — others depend on them)

- [ ] `shared/schema.md` — Central Database schema. Must include at minimum:
  - `users` (id, role: student|teacher|admin, name, email, phone, hashed password, **encrypted fields**, created_at, status: active|blocked)
  - `student_profile` (age **[needed for 10–12 chat censor]**, class/grade)
  - `teacher_profile` (subjects, bio, **hourly_rate**, social links)
  - `availability` (teacher_id, day, start, end)
  - `bookings` (id, student_id, teacher_id, slot, status: pending|approved|rejected|paid|completed, amount)
  - `payments` (booking_id, razorpay_payment_id, amount, status, timestamp)
  - `sessions` (booking_id, meet_or_zoom_link, started_at, ended_at, attendance[], recording_url, recording_consent)
  - `messages` (chat server-side store, sender_id, room, content, flagged, censored)
  - `feedback` (booking_id, student_id, teacher_id, rating, testimony_text)
  - `audit_logs` (user_id, device_id, ip, feature_accessed, timestamp, event)
  - `active_sessions` (user_id, device_id, token_hash) — powers the single-session lock
- [ ] `shared/api-contract.md` — every endpoint both directions rely on (auth, bookings, payments, chat, notifications, feedback). Publish it BEFORE building features and never break it silently.

### 3.2 Backend core

- [ ] **Central Database** (`backend/db/`) — implement the schema, with seed data for demo.
- [ ] **Authentication & Registration** (`backend/auth/`):
  - Role-based registration & login for all three roles.
  - **MFA + authenticator app at sign-in**: TOTP (e.g., `otplib`/`speakeasy`) with QR enrollment on first login.
  - **Encrypted holder**: encrypt sensitive fields at rest (AES-256; e.g., `crypto`), password hashing with `bcrypt`.
  - **Single active session**: one student (and each user) signed in **cannot sign in on another platform/device simultaneously** — reject or invalidate the older session via `active_sessions`.
- [ ] **Security & cyber module** (`backend/security/`):
  - Log every request: **device ID, user ID, IP, feature accessed, timestamp** → `audit_logs`.
  - Detect & alert on **duplicate sign-in attempts**.
  - Input validation, rate limiting, XSS/CSRF protection.
  - A small **checking/testing** suite (unit + integration tests) for auth & security.
- [ ] **Payment gateway** (`backend/payments/`):
  - Razorpay order creation, checkout session, webhook verification, capture.
  - Booking status transitions: `pending → approved → paid → completed`.
  - Expose **Payment Monitoring** endpoints for the Admin dashboard.
- [ ] **Notifications + publish–subscribe broker** (`backend/notifications/`):
  - Pub-sub model: producers (booking paid, class starting, chat message) publish to channels/topics; subscribers (student UI, teacher UI, admin) receive events.
  - **WhatsApp & Email notification** on booking confirmation.
- [ ] **Chat moderation engine**: profanity/age filter API used by chat rooms; **censor mode for ages 10, 11, 12** (default per Step 0 answer #8).

### 3.3 Admin dashboard (`admin/`, port 5173)

- [ ] **Manage Students** — view, **add**, edit, **block/unblock**
- [ ] **Manage Teachers** — view, **add**, edit, **block/unblock**, approve profiles
- [ ] **Global Chat Moderation** — live view of shared student messages, delete/flag, moderation & controls
- [ ] **Manage Bookings** — override/view all bookings and their status
- [ ] **Payment Monitoring** — all transactions, refunds initiation, revenue reports
- [ ] **Recording & Reports** — recording registry (with consent flags), attendance/session-log reports, download links
- [ ] **User Permissions** — role & permission matrix management
- [ ] **Social-media promotion** — manage promo content/links shown on the public landing area (ask the user where this should live: static landing page in `admin/` is the default)

### Definition of done (Bhuvan)

- MFA enrollment + login + single-session lock demonstrated on two devices.
- A paid test booking flows end-to-end (Razorpay test mode) and fires a notification.
- Audit log rows exist for a duplicate sign-in attempt and a blocked feature access.
- Admin dashboard can add & block a user and moderate a chat message.
- `shared/` contract files complete; backend tests pass.

---

## 4. ASHISH — TEACHER (you are Ashish only if the user said so)

You own `teacher/` only. You **consume** `shared/api-contract.md` — never edit it.

### 4.1 Teacher dashboard (`teacher/`, port 5174)

- [ ] **Teacher profile** — subjects, bio, social links; hourly rate is stored on profile
- [ ] **Set Availability** — weekly/daily slot grid; slots are offered to students for booking
- [ ] **Hourly charge configuration** — set/update **hourly rate** per subject; the booking amount = hours × rate (amount comes from the API, you display it)
- [ ] **View Booking Queue** — pending requests from students with requested timings
- [ ] **Accept / Reject Requests** — approve or reject; on approval the platform routes to Razorpay (Bhuvan's flow) — you just show status
- [ ] **Conduct Classes** — start session page with the **Google Meet or Zoom** link (ask user which — Step 0 #4); one-to-one class view; class start/end triggers attendance logging via API
- [ ] **Attendance & Session Logs** — session summary (join/leave times, duration) fetched from API
- [ ] **Recording (with consent)** — toggle recording consent per session; recordings are stored/managed by the backend — you display status & links
- [ ] **View Student Feedback** — read-only feedback & testimonials submitted by your students

### Definition of done (Ashish)

- Teacher can create availability, receive a queued request, accept it, and see it move to payment/confirmed states.
- A session page opens with the Meet/Zoom link and logs attendance on start/end.
- Feedback submitted by Vinay (in a demo) is visible here.
- Nothing outside `teacher/` was modified; API contract was consumed, not changed.

---

## 5. VINAY — STUDENT (you are Vinay only if the user said so)

You own `student/` only. You **consume** `shared/api-contract.md` — never edit it.

### 5.1 Student dashboard (`student/`, port 5175)

- [ ] **Browse Teachers** — teacher list/search with subjects, bio, **hourly rate**, availability preview
- [ ] **Request Class Timing** — pick a teacher → pick from their availability → request a slot (**slot booking**); pending until teacher accepts
- [ ] **My Bookings** — all requests with live status (pending / approved → **pay now** button → paid / completed); payment is executed through the Razorpay checkout the backend exposes (gateway code itself is Bhuvan's)
- [ ] **Payment History** — list of payments with receipts/status
- [ ] **Session History** — past sessions with attendance, duration, recording link **only if consent was given**
- [ ] **Global Live Chat** — student community chat over the pub-sub backend:
  - Real-time messages (Socket channel from Bhuvan's broker)
  - **Age-censored mode for ages 10, 11, 12** — if the logged-in student's age is 10–12, the UI requests/enforces the censored channel and displays filtered output
- [ ] **Testimony / Feedback** — after a completed session, submit rating + testimony text; optionally allow display on the promo/landing area
- [ ] Sign-in UX must respect **single-session lock** (if the API rejects with "already signed in elsewhere", show that message clearly — do not try to work around it)

### Definition of done (Vinay)

- Student can browse → request a slot → see approval → pay (test mode) → see confirmed session & history.
- Live chat works in real time; a 10–12 age student gets the censored experience.
- Testimony submission for a completed session works.
- Nothing outside `student/` was modified; API contract consumed, not changed.

---

## 6. INTEGRATION FLOW (READ-ONLY REFERENCE — from the flowchart)

```
EDTECH PLATFORM
   └── Authentication & Registration ──> User Role
          ├── STUDENT (Vinay):  Browse Teachers · Request Class Timing · My Bookings ·
          │                     Global Live Chat · Payment History · Session History
          ├── TEACHER (Ashish): Set Availability · View Booking Queue · Accept/Reject ·
          │                     Conduct Classes · View Student Feedback
          └── ADMIN (Bhuvan):   Manage Students · Manage Teachers · Global Chat Moderation ·
                                Manage Bookings · Payment Monitoring · Recording & Reports ·
                                User Permissions

Booking pipeline:
Request Class Timing ─> Booking Queue ─> Teacher Approval ─> Razorpay Payment
   ─> Booking Confirmation ─> WhatsApp & Email Notification ┐
   ─> Live Classroom (Meet/Zoom) ─> Attendance & Session Logs ─> Recording (With Consent)
   ─> Feedback Form

Chat pipeline:
Real-time Global Chat Server ─> Shared Student Messages ─> Admin Moderation & Controls

All three dashboards ─> Central Database (owned by Bhuvan)
```

---

## 7. FINAL CHECKLIST (every member, every session)

1. Asked identity? ✔ Only then proceed.
2. Asked the Step 0 open questions and recorded answers? ✔
3. Working only inside your ownership folders/ports? ✔
4. On your role-prefixed branch? ✔
5. Consuming `shared/` read-only (unless you are Bhuvan)? ✔
6. Using the backend API for anything cross-role (never calling another member's code directly)? ✔
7. Ran your own lint/tests before push? ✔

**Remember:** if a needed API or schema field is missing, do NOT add it in your own folder —
ask Bhuvan (or have the user run a Bhuvan session) to extend the contract, then use it.
