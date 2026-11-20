# EdTech Teacher Dashboard

Teacher-facing SPA for the EdTech one-to-one tutoring platform.

**Owner:** Ashish
**Port:** 5174
**Branch prefix:** `teacher/*`

## Features

- **Profile Management** — Set subjects, bio, and hourly rate
- **Availability** — Weekly slot grid for student booking
- **Booking Queue** — Accept/reject student booking requests
- **Conduct Classes** — Start/end sessions with Zoom integration
- **Attendance & Session Logs** — View join/leave times and duration
- **Recording Consent** — Toggle recording per session
- **Schedule** — Weekly calendar view of all bookings & sessions
- **Student Feedback** — Read-only testimonials and ratings

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- React Router v7
- lucide-react icons

## Setup

```bash
cd teacher
npm install
npm run dev
```

The dev server starts on `http://localhost:5174` and proxies `/api` to the backend at `http://localhost:4000`.

## API Dependency

This SPA consumes the backend API (owned by Bhuvan). It **never** modifies files outside the `teacher/` directory.

The following API endpoints are consumed:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/mfa/verify` | MFA verification |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current session |
| GET | `/api/teacher/dashboard/stats` | Dashboard summary |
| GET/PATCH | `/api/teacher/profile` | View/update profile |
| GET/PUT | `/api/teacher/availability` | Manage availability slots |
| GET | `/api/teacher/bookings` | List bookings |
| POST | `/api/teacher/bookings/:id/approve` | Accept booking |
| POST | `/api/teacher/bookings/:id/reject` | Reject booking |
| GET | `/api/teacher/sessions` | List class sessions |
| GET | `/api/teacher/sessions/:id` | Session detail + attendance |
| POST | `/api/teacher/sessions/:id/start` | Start session |
| POST | `/api/teacher/sessions/:id/end` | End session |
| PATCH | `/api/teacher/sessions/:id/recording-consent` | Toggle recording |
| GET | `/api/teacher/feedback` | View student feedback |

> **Note:** These endpoints need to be implemented in the backend by Bhuvan. The teacher dashboard is designed to work with these exact contracts.
