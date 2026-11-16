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

## Planning

Track work through GitHub Issues and the repository's project board. Each issue should have one owner, a clear outcome, and acceptance criteria. Confirm open technology and integration choices with the team before implementation.
