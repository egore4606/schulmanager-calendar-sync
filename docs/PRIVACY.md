# Privacy and data handling

This project processes school timetable information. Depending on the Schulmanager account and tenant, that information can include teacher names, room assignments, lesson comments, substitutions, and other personal or organizational data.

## Data flow

1. An authorized bearer token is sent only to the configured Schulmanager base URL.
2. Timetable responses are normalized in memory.
3. Raw response objects are discarded before `schedule.json` is written.
4. Normalized events are sent to the configured Google Calendar when synchronization is enabled.
5. Refreshed bearer tokens are stored locally with restrictive file permissions where supported.

## Local files

| File | Contents | Sensitivity |
| --- | --- | --- |
| `.env` | Tokens, IDs, and configuration | Secret |
| `data/google-service-account.json` | Google private key | Secret |
| `data/token-store.json` | Refreshed bearer token | Secret |
| `data/schedule.json` | Normalized timetable | Personal/organizational data |
| `data/status.json` | Range, timestamps, and event count | Operational metadata |
| `data/subject-icons.json` | User-edited subject-to-emoji mapping | Configuration; may reveal school-specific subject names |

All are ignored by Git. The Docker image also excludes them.

## Google Calendar ownership

The service creates events with a private `managedBy` marker and only reconciles events bearing that marker. Manual edits to managed events can be overwritten. Unrelated events in the same calendar are not selected for deletion.

For the strongest separation, use a dedicated calendar rather than a primary personal calendar.

## Public support requests

Never include bearer tokens, Google keys, calendar IDs, raw API responses, complete schedule snapshots, or unredacted logs in an issue or discussion. Replace real names, school details, dates, room numbers, and identifiers with synthetic examples.

Report security vulnerabilities through GitHub's private vulnerability reporting flow described in [SECURITY.md](../SECURITY.md).
