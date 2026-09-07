# Configuration reference

Copy `.env.example` to `.env` and keep the resulting file outside version control.

## Schulmanager

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SCHULMANAGER_TOKEN` | Yes on first run | — | Bearer token from an authorized Schulmanager session. A refreshed token is stored in `data/token-store.json`. |
| `SCHULMANAGER_STUDENT_ID` | No | auto-detected | Numeric student ID override. Auto-detection covers both a student login (`associatedStudent`) and a parent login (the first child under `associatedParents`); set this only when discovery still fails or to pick a specific child on a parent account with multiple children. |
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
| `SYNC_EXAMS_ENABLED` | No | `false` | Also fetch exams (Klassenarbeiten) and sync them as calendar events alongside lessons. |

Boolean values accept `1`, `true`, `yes`, or `on` (case-insensitive).

## Google Calendar

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GOOGLE_CALENDAR_SYNC_ENABLED` | No | `false` | Enables writes to Google Calendar. |
| `GOOGLE_CALENDAR_ID` | When enabled | — | Target calendar ID. It is often an email-like value and should be treated as private metadata. |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | When enabled | `/data/google-service-account.json` | Path to the mounted JSON key. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Alternative | — | Complete credentials JSON supplied through the environment. Prefer a mounted file to avoid accidental log or process inspection exposure. |
| `GOOGLE_CALENDAR_TITLE_TEMPLATE` | No | `({location}) {icon} {summary}` | Custom lesson event title. See placeholders below. |
| `GOOGLE_CALENDAR_EXAM_TITLE_TEMPLATE` | No | `📝 {type}: {subjectName}` | Custom exam event title. Same placeholders plus `{type}` (the exam type from Schulmanager, e.g. "Klassenarbeit" or "Test"); `{location}` and `{teachers}` are normally empty since `get-exams` doesn't return that data. |
| `GOOGLE_CALENDAR_STRIKETHROUGH_CANCELLED` | No | `false` | Render cancelled lesson titles with a Unicode strikethrough overlay. Cosmetic only: the Calendar API has no real text formatting, and rendering may vary by client. |
| `GOOGLE_CALENDAR_SUBJECT_ICONS_FILE` | No | `${DATA_DIR}/subject-icons.json` | Path to the subject-to-emoji mapping used for `{icon}`. Created automatically from the built-in defaults on first run; edit it to add or change entries. |

The target calendar must be shared with the service account's `client_email` and grant permission to edit events.

### Subject icons

`{icon}` is resolved from a JSON mapping file (default `data/subject-icons.json`, override the path with `GOOGLE_CALENDAR_SUBJECT_ICONS_FILE`). The file is created automatically from a built-in default table (common German school subjects) the first time it's needed, so you can open it afterwards and edit it directly — changes take effect on the next sync, no restart required.

Keys support a `*` wildcard and are matched case-insensitively against `{subjectName}` (the full subject name) first, then `{subject}` (the short label); the first matching key wins. The special key `default` sets the icon used when nothing matches (built-in default: none, i.e. no icon).

```json
{
  "Mathe*": "➗",
  "Bio*": "🧬",
  "default": "📚"
}
```

The file must be a JSON object whose values are strings. If it is unreadable, invalid JSON, or has a different shape, the sync falls back to the built-in defaults and logs a warning rather than failing.

### Title placeholders

`GOOGLE_CALENDAR_TITLE_TEMPLATE` and `GOOGLE_CALENDAR_EXAM_TITLE_TEMPLATE` support the following placeholders. An unknown placeholder is left untouched. Any `()` left empty by a missing placeholder (e.g. no room) is dropped, and repeated whitespace is collapsed.

| Placeholder | Value |
| --- | --- |
| `{summary}` | The normalized summary, including a `Changed:`/`Cancelled:`/`Special:` prefix when applicable. Lessons only. |
| `{location}` | The room name, or empty when none is known. Lessons only; always empty for exams. |
| `{subject}` | The short subject label (e.g. `Math`). |
| `{subjectName}` | The full subject name. |
| `{icon}` | An emoji for the subject, looked up from the subject-icons mapping file (see above); empty when nothing matches. |
| `{teachers}` | Comma-separated teacher full names, without abbreviations. Lessons only; always empty for exams. |
| `{classHour}` | The class hour number(s). |
| `{type}` | The exam type as configured in Schulmanager (e.g. `Klassenarbeit`, `Test`). Exams only; always empty for lessons. |

Example: `GOOGLE_CALENDAR_TITLE_TEMPLATE={icon} {subject} - {location}` renders titles like `➗ Math - Room 204`.

The built-in icon table is matched against `{subjectName}` and then `{subject}` (e.g. `Mathe`, `Biologie`, `Sport`, `Englisch`, ...); subjects it doesn't recognize get no icon unless the mapping file sets a `default`. Add entries for subjects specific to your school by editing that file.

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
