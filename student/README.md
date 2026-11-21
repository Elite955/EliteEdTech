# Student Portal

React/Vite student SPA for the one-to-one tutoring platform. It runs on port `5175` and consumes the backend API and Socket.IO server; it does not contain backend logic.

## Run

```bash
cd student
npm install
npm run dev
npm run build
```

The dev server proxies `/api` and `/socket.io` to `http://localhost:4000`. For deployed builds, set `VITE_API_URL` to the API origin and `VITE_SOCKET_URL` to the Socket.IO origin.

## Features

| Area | Files |
|---|---|
| Browse/search approved teachers | `src/pages/BrowseTeachers.jsx` |
| Request a slot from availability | `src/pages/RequestSlot.jsx` |
| Bookings with Razorpay test checkout | `src/pages/MyBookings.jsx`, `src/lib/razorpay.js` |
| Payment history | `src/pages/PaymentHistory.jsx` |
| Sessions, attendance, countdown, join dialog | `src/pages/SessionHistory.jsx`, `src/components/JoinClassDialog.jsx` |
| Global chat with age 10–12 server-side censoring | `src/components/GlobalChat.jsx`, `src/context/AuthContext.jsx` |
| Feedback after completed sessions | `src/pages/Feedback.jsx` |
| Teacher view-only shared whiteboard | `src/components/SharedWhiteboard.jsx` |

Sign-in uses the `edtech_student_session` HttpOnly cookie. Students enroll TOTP MFA on first login. Sessions are recorded through `POST /api/sessions/:id/attendance` when the join dialog opens and closes.

See `../shared/api-contract.md` for the full HTTP and Socket.IO contract.
