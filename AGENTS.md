# Agent guidelines

## Scope

This repository is a privacy-sensitive synchronization service. Treat timetable data, tokens, calendar identifiers, school information, and runtime files as confidential even when examples appear synthetic.

## Required validation

- Run `npm run verify` after source or test changes.
- Build the Docker image after Dockerfile, Compose, runtime, or packaging changes.
- Never call live Schulmanager or Google APIs from tests.

## Invariants

- Only Google events marked as managed by this project may be updated or deleted.
- Raw Schulmanager response objects must not be persisted.
- Health responses and errors must not expose tokens, calendar IDs, keys, or complete upstream bodies.
- Runtime state belongs under `data/` and must remain ignored by Git and Docker contexts.
- New configuration requires updates to `.env.example` and `docs/CONFIGURATION.md`.

Prefer small, reviewable changes and never rewrite public history without explicit owner approval.
