# Configuration reference

Copy `.env.example` to `.env` and keep the resulting file outside version control.

## Schulmanager

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SCHULMANAGER_TOKEN` | Yes on first run | — | Bearer token from an authorized Schulmanager session. A refreshed token is stored in `data/token-store.json`. |
| `SCHULMANAGER_STUDENT_ID` | No | auto-detected | Numeric student ID when `/api/login-status` cannot discover the associated student. |
| `SCHULMANAGER_BUNDLE_VERSION` | No | auto-discovered | Frontend bundle identifier. Override only when discovery stops working. |
| `SCHULMANAGER_BASE_URL` | No | `https://login.schulmanager-online.de` | Schulmanager origin. Do not point this at an untrusted host because the bearer token is sent to it. |
| `SCHULMANAGER_TIMEZONE` | No | `Europe/Berlin` | IANA timezone used for lesson dates and Google events. |

## Synchronization

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SYNC_INTERVAL_MINUTES` | No | `30` | Positive interval between synchronization runs. |
| `SYNC_PAST_WEEKS` | No | `2` | Complete weeks retained before the current week. |
| `SYNC_FUTURE_WEEKS` | No | `2` | Complete weeks synchronized after the current week. |
| `SYNC_INCLUDE_CANCELLED` | No | `false` | Include cancelled lessons as events. |
| `SYNC_NO_MERGE_ADJACENT` | No | `false` | Keep adjacent identical lessons as separate events. |

Boolean values accept `1`, `true`, `yes`, or `on` (case-insensitive).

## Google Calendar

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GOOGLE_CALENDAR_SYNC_ENABLED` | No | `false` | Enables writes to Google Calendar. |
| `GOOGLE_CALENDAR_ID` | When enabled | — | Target calendar ID. It is often an email-like value and should be treated as private metadata. |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | When enabled | `/data/google-service-account.json` | Path to the mounted JSON key. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Alternative | — | Complete credentials JSON supplied through the environment. Prefer a mounted file to avoid accidental log or process inspection exposure. |

The target calendar must be shared with the service account's `client_email` and grant permission to edit events.

## Container and health server

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `8080` | Internal health-server port, from 1 through 65535. |
| `HOST_PORT` | No | `8080` | Loopback host port used by Docker Compose. |
| `DATA_DIR` | No | `/data` | Writable runtime-state directory. |

The service listens inside the container on `0.0.0.0`, while the supplied Compose files publish it only on `127.0.0.1`. Keep that restriction unless an authenticated proxy is placed in front of it.

## Secret handling

- Never commit `.env`, `token-store.json`, or a Google service-account key.
- Prefer file permissions that allow only the service account running Docker to read `data/`.
- Rotate a Schulmanager token or Google key immediately after any suspected disclosure.
- Do not attach `schedule.json` or service logs to public issues without reviewing and redacting them.
