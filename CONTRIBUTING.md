# Contributing

Thanks for contributing to the EdTech Platform.

## Before starting

- Check the GitHub Project board and choose an issue assigned to you.
- Read the issue's scope and acceptance criteria.
- Coordinate API contracts and shared files with the relevant teammate before changing them.

## Branch and commit conventions

Create a branch from the latest `main`:

```bash
git checkout main
git pull origin main
git checkout -b feature/short-description
```

Use `fix/short-description` for bug fixes.

Write clear commits, for example:

```text
feat(auth): add student registration endpoint
fix(booking): prevent duplicate slot reservations
docs: update local setup instructions
```

## Pull requests

- Open a PR into `main`.
- Explain what changed and how you tested it.
- Link the issue using `Closes #<issue-number>`.
- Request review from at least one teammate.
- Resolve review comments and wait for approval before merging.
- Do not merge code that breaks the agreed MVP flow.

## Team coordination

- Keep each issue owned by one person; ask for help in issue comments.
- Discuss shared API contracts before implementing dependent frontend/backend work.
- Move issues across the Project board: Todo → In Progress → Done.
- Update the issue if scope or delivery timing changes.

## Security

Never commit secrets, private keys, real credentials, or payment card data. Use environment variables and a sanitized `.env.example`.
