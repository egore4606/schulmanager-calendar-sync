import { createHash, createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rfc3339WithOffset } from "./timezone.mjs";

const MANAGED_BY = "schulmanager-calendar-sync";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API_ROOT = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const REQUEST_TIMEOUT_MS = 20000;
const WRITE_DELAY_MS = 300;
const MAX_RETRIES = 6;

let tokenCache = null;

export function isGoogleCalendarSyncEnabled() {
  return envFlag("GOOGLE_CALENDAR_SYNC_ENABLED");
}

export async function pushGoogleCalendar({ events, range, logger = console }) {
  const calendarId = requiredEnv("GOOGLE_CALENDAR_ID");
  const credentials = await readCredentials();
  const accessToken = await getAccessToken(credentials);

  const desiredEvents = new Map();
  for (const event of events) {
    if (event.cancelled) {
      continue;
    }
    const googleEvent = toGoogleEvent(event);
    desiredEvents.set(googleEvent.id, googleEvent);
  }

  const existingEvents = await listManagedEvents({ accessToken, calendarId, range });
  const existingById = new Map(existingEvents.map((event) => [event.id, event]));

  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  let skipped = 0;

  for (const event of desiredEvents.values()) {
    const existing = existingById.get(event.id);
    if (existing) {
      if (isSameGoogleEvent(existing, event)) {
        skipped += 1;
      } else {
        await updateEvent({ accessToken, calendarId, event });
        updated += 1;
      }
    } else {
      await insertEvent({ accessToken, calendarId, event });
      inserted += 1;
    }
    const processed = inserted + updated + skipped;
    if (processed % 10 === 0 || processed === desiredEvents.size) {
      logger.log(
        `Google Calendar sync progress: ${processed}/${desiredEvents.size} processed`
      );
    }
    if (inserted || updated) {
      await delay(WRITE_DELAY_MS);
    }
  }

  for (const event of existingEvents) {
    if (!desiredEvents.has(event.id)) {
      await deleteEvent({ accessToken, calendarId, eventId: event.id });
      deleted += 1;
    }
  }

  const result = {
    inserted,
    updated,
    deleted,
    skipped,
    total: desiredEvents.size
  };
  logger.log(
    `Google Calendar sync finished: ${inserted} inserted, ${updated} updated, ${deleted} deleted, ${skipped} unchanged`
  );
  return result;
}

function toGoogleEvent(event) {
  const timeZone = event.timezone || "Europe/Berlin";
  return {
    id: googleEventId(event.uid),
    summary: googleEventSummary(event),
    description: event.description || "",
    location: event.location || "",
    start: {
      dateTime: rfc3339WithOffset(event.date, event.startTime, timeZone),
      timeZone
    },
    end: {
      dateTime: rfc3339WithOffset(event.date, event.endTime, timeZone),
      timeZone
    },
    status: "confirmed",
    extendedProperties: {
      private: {
        managedBy: MANAGED_BY,
        schulmanagerUid: event.uid
      }
    }
  };
}

function googleEventId(uid) {
  return `sm${createHash("sha256").update(uid).digest("hex").slice(0, 48)}`;
}

function googleEventSummary(event) {
  return event.location ? `(${event.location}) ${event.summary}` : event.summary;
}

function isSameGoogleEvent(existing, desired) {
  return (
    existing.summary === desired.summary &&
    (existing.description || "") === (desired.description || "") &&
    (existing.location || "") === (desired.location || "") &&
    existing.status === desired.status &&
    existing.start?.dateTime === desired.start.dateTime &&
    existing.start?.timeZone === desired.start.timeZone &&
    existing.end?.dateTime === desired.end.dateTime &&
    existing.end?.timeZone === desired.end.timeZone &&
    existing.extendedProperties?.private?.managedBy === MANAGED_BY &&
    existing.extendedProperties?.private?.schulmanagerUid ===
      desired.extendedProperties.private.schulmanagerUid
  );
}

async function readCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  const filePath =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "/data/google-service-account.json";
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 60) {
    return tokenCache.accessToken;
  }

  const assertion = signJwt({
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
    now
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const json = await parseGoogleResponse(response, "OAuth token");
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + Number(json.expires_in || 3600)
  };
  return tokenCache.accessToken;
}

function signJwt({ clientEmail, privateKey, now }) {
  if (!clientEmail || !privateKey) {
    throw new Error("Google service account JSON is missing client_email or private_key.");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

async function listManagedEvents({ accessToken, calendarId, range }) {
  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: "2500",
    privateExtendedProperty: `managedBy=${MANAGED_BY}`,
    timeMin: `${range.start}T00:00:00Z`,
    timeMax: `${addDays(range.end, 1)}T00:00:00Z`
  });

  const events = [];
  let pageToken = null;
  do {
    if (pageToken) {
      params.set("pageToken", pageToken);
    } else {
      params.delete("pageToken");
    }
    const json = await googleRequest({
      accessToken,
      path: `/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    });
    events.push(...(json.items || []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return events;
}

async function insertEvent({ accessToken, calendarId, event }) {
  await googleRequest({
    accessToken,
    path: `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    method: "POST",
    body: event
  });
}

async function updateEvent({ accessToken, calendarId, event }) {
  await googleRequest({
    accessToken,
    path: `/calendars/${encodeURIComponent(calendarId)}/events/${event.id}?sendUpdates=none`,
    method: "PUT",
    body: event
  });
}

async function deleteEvent({ accessToken, calendarId, eventId }) {
  await googleRequest({
    accessToken,
    path: `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=none`,
    method: "DELETE"
  });
}

async function googleRequest({ accessToken, path, method = "GET", body = null }) {
  const label = `${method} ${path}`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${CALENDAR_API_ROOT}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body ? { "content-type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal
      });
      const text = await response.text();
      if (response.ok) {
        return text ? JSON.parse(text) : {};
      }
      if (attempt < MAX_RETRIES && isRetryableGoogleError(response.status, text)) {
        await delay(backoffMs(attempt));
        continue;
      }
      throw new Error(
        `${label} failed with HTTP ${response.status}: ${safeGoogleError(text)}`
      );
    } catch (error) {
      if (error.name === "AbortError") {
        if (attempt < MAX_RETRIES) {
          await delay(backoffMs(attempt));
          continue;
        }
        throw new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS} ms`);
      }
      if (attempt < MAX_RETRIES && isRetryableNetworkError(error)) {
        await delay(backoffMs(attempt));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRetryableGoogleError(status, text) {
  return (
    status === 429 ||
    status >= 500 ||
    (status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(text))
  );
}

function isRetryableNetworkError(error) {
  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code);
}

function backoffMs(attempt) {
  return Math.min(30000, 1000 * 2 ** attempt);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseGoogleResponse(response, label) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${label} failed with HTTP ${response.status}: ${safeGoogleError(text)}`
    );
  }
  return text ? JSON.parse(text) : {};
}

function safeGoogleError(text) {
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.error_description;
    if (message) {
      return String(message).replace(/\s+/g, " ").slice(0, 300);
    }
  } catch {
    // Do not echo an unknown response body; it may contain event data.
  }
  return "Google API returned an error response.";
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function envFlag(name) {
  return ["1", "true", "yes", "on"].includes(
    String(process.env[name] || "").toLowerCase()
  );
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
