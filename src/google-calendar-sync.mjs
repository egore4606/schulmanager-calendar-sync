import { createHash, createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rfc3339WithOffset } from "./timezone.mjs";
import { loadSubjectIconMapping, subjectIcon } from "./subject-icons.mjs";

const MANAGED_BY = "schulmanager-calendar-sync";
const DEFAULT_TITLE_TEMPLATE = "({location}) {icon} {summary}";
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

  const desiredEvents = buildDesiredGoogleEvents(events);

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

export function buildDesiredGoogleEvents(events) {
  const template = titleTemplate();
  const iconMapping = template.includes("{icon}") ? loadSubjectIconMapping() : undefined;
  const desiredEvents = new Map();
  for (const event of events) {
    const googleEvent = toGoogleEvent(event, { template, iconMapping });
    desiredEvents.set(googleEvent.id, googleEvent);
  }
  return desiredEvents;
}

function toGoogleEvent(event, { template, iconMapping }) {
  const timeZone = event.timezone || "Europe/Berlin";
  const title = renderEventTitle(template, event, { iconMapping });
  return {
    id: googleEventId(event.uid),
    summary:
      event.cancelled && envFlag("GOOGLE_CALENDAR_STRIKETHROUGH_CANCELLED")
        ? strikethroughTitle(title)
        : title,
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

function titleTemplate() {
  return process.env.GOOGLE_CALENDAR_TITLE_TEMPLATE || DEFAULT_TITLE_TEMPLATE;
}

export function renderEventTitle(template, event, { iconMapping } = {}) {
  const fields = titleFields(event, {
    iconMapping,
    resolveIcon: template.includes("{icon}")
  });
  const substituted = substituteTemplate(template, fields);
  return cleanupRenderedTitle(substituted);
}

function titleFields(event, { iconMapping, resolveIcon }) {
  return {
    summary: event.summary,
    subject: event.subjectLabel || "",
    subjectName: event.subjectName || "",
    icon: resolveIcon ? subjectIcon(event.subjectName, event.subjectLabel, iconMapping) : "",
    location: event.location || "",
    teachers: (event.teacherNames || [])
      .map((name) => name.replace(/^.*\((.*)\)$/, "$1"))
      .join(", "),
    classHour: event.classHourNumber || ""
  };
}

function substituteTemplate(template, fields) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : match
  );
}

function cleanupRenderedTitle(text) {
  return text
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function strikethroughTitle(title) {
  return [...GRAPHEME_SEGMENTER.segment(title)]
    .map(({ segment }) => `${segment}̶`)
    .join("");
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

export async function insertEvent({ accessToken, calendarId, event }) {
  try {
    await googleRequest({
      accessToken,
      path: `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
      method: "POST",
      body: event
    });
  } catch (error) {
    if (error.status === 409) {
      // The id was previously used by an event that got cancelled/deleted
      // outside our reconciliation (e.g. manually in Google Calendar), so
      // events.list no longer returns it but the id is still reserved.
      // Revive it instead of failing the whole sync.
      await updateEvent({ accessToken, calendarId, event });
      return;
    }
    throw error;
  }
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
  const label = `${method} Google Calendar request`;
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
      const httpError = new Error(`${label} failed with HTTP ${response.status}.`);
      httpError.status = response.status;
      httpError.isSanitizedGoogleError = true;
      throw httpError;
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
      if (error.isSanitizedGoogleError) {
        throw error;
      }
      throw new Error(`${label} failed.`);
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
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return text ? JSON.parse(text) : {};
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
