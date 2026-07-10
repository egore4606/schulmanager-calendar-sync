# Contributing

Thank you for improving Schulmanager Calendar Sync.

## Before opening an issue

- Use Discussions for setup questions and early ideas.
- Search existing issues and confirm the behavior on the latest release.
- Remove tokens, keys, calendar IDs, teacher/student names, school details, timetable snapshots, and unredacted logs.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Development workflow

1. Create a focused branch from the latest `main`.
2. Make the smallest coherent change.
3. Add or update Node tests for behavioral changes.
4. Run `npm run verify`.
5. Build the container when Docker or runtime behavior changes.
6. Open a pull request using the repository template.

Pull requests are squash-merged after required checks pass. Keep unrelated refactoring out of bug fixes.

## Code expectations

- Use native Node.js APIs unless a dependency materially improves safety or maintainability.
- Preserve stable event IDs and the rule that only project-managed Google events may be deleted.
- Treat all Schulmanager responses and runtime files as potentially sensitive.
- Do not log credentials or complete upstream response bodies.
- Document new environment variables in `.env.example` and `docs/CONFIGURATION.md`.

## Testing

Tests must not call live Schulmanager or Google services. Use synthetic fixtures and injected fetch implementations.
