# Operations and releases

## Health and logs

```bash
docker compose ps
docker compose logs --tail=200 schulmanager-calendar
curl -fsS http://127.0.0.1:8080/health
```

`/health` returns HTTP `200` after a successful sync and `503` before the first success or after the latest run fails. It contains timestamps, the synchronized date range, event counts, and reconciliation totals; it intentionally omits tokens and calendar identifiers.

## Backups

Before an update, back up the runtime directory outside the repository:

- `google-service-account.json` is the private Google key;
- `token-store.json` may contain the freshest Schulmanager token;
- `schedule.json` and `status.json` help diagnose the last run.

The Google Calendar itself remains the authoritative copy of published events, while GitHub releases are the authoritative source for application code and container versions.

## Updating a source build

1. Review the release notes and back up `data/` and `.env`.
2. Pull the intended Git tag or approved `main` revision.
3. Run `npm run verify` and build the container.
4. Recreate the service and verify `/health` plus recent logs.

Avoid deploying an unreviewed feature branch to the long-running service.

## Updating a GHCR deployment

Pin `SCHULMANAGER_IMAGE` in `.env` to an immutable release tag, then pull and recreate the service with `docker-compose.ghcr.yml`. Using `latest` is convenient for testing but makes rollback less predictable.

## Rollback

1. Select the previous known-good release tag.
2. Restore the previous image reference or Git revision.
3. Keep the existing `.env` and `data/` unless the release notes explicitly describe a migration.
4. Recreate the container and verify health and Google Calendar behavior.

Events use stable IDs, so restarting or rolling back does not create duplicates under normal operation.

## Credential rotation

If a Schulmanager token is exposed, revoke the corresponding session where possible, obtain a new token, replace the value in `.env`, and remove `data/token-store.json` before restarting.

If a Google service-account key is exposed, disable/delete it in Google Cloud, issue a replacement, update the mounted file, and review calendar sharing plus audit logs.

## Release process

The repository uses semantic version tags. A tag matching `v*.*.*` triggers:

- automated tests and a container build;
- a GitHub Release with generated notes;
- a GHCR image tagged with the release version.

Patch releases contain compatible fixes, minor releases add backward-compatible behavior, and major releases may require configuration or operational changes.
