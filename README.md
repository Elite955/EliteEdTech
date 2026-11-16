# EdTech Platform

A one-to-one teacher–student learning platform with teacher profiles, class scheduling, payments, live-class/meeting support, and communication.

## Project status

This repository is being developed as a 7-day MVP by a three-person team. The first goal is a working end-to-end demonstration of the core teacher–student booking journey. Advanced live-class, chat, and payment features should use practical MVP integrations or clearly documented demo workflows.

## Team responsibilities

| Team member | Area | GitHub |
|---|---|---|
| Ashish | Python backend, authentication, database, integration | @ashishMenon05 |
| Bhuvan | Frontend, landing page, login/register, dashboards | Confirm GitHub username |
| Vinay | Teacher profiles, availability, booking, chat/payment workflow and testing | Confirm GitHub username |

## Development workflow

1. Pick an issue from the **EdTech Development Tracker** project board.
2. Assign the issue to one owner and move it to **In Progress**.
3. Create a branch using `feature/short-description` or `fix/short-description`.
4. Commit small, meaningful changes.
5. Open a Pull Request into `main`; include `Closes #<issue-number>` in the PR description.
6. Request a teammate review. Merge only after the change is tested.
7. Move the issue to **Done** after the PR is merged.

Do not push unfinished work directly to `main`.

## Suggested repository layout

```text
EDtech-Repo/
├── backend/          # Python API and business logic
├── frontend/         # Web client
├── docs/             # Architecture, API contracts and setup notes
├── tests/            # Automated and integration tests
├── .gitignore
├── CONTRIBUTING.md
└── README.md
```

Create these folders as the corresponding work starts; avoid committing empty placeholder directories.

## MVP priorities

- Teacher/student registration and login
- Teacher profiles and availability
- Student class booking and teacher booking view
- Role-based dashboards
- A demonstrable communication/meeting flow
- Sandbox/demo-only payment flow, if time permits

## Safety and configuration

- Never commit API keys, passwords, database credentials, or real payment details.
- Keep local secrets in an untracked `.env` file.
- Provide a sanitized `.env.example` for required configuration.
- Use payment sandbox mode only; do not process real charges during the MVP demo.

## Planning

Track work through GitHub Issues and the repository's Project board. Each issue should have one owner, a clear outcome, and acceptance criteria.
