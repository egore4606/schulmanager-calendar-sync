import assert from "node:assert/strict";
import test from "node:test";
import {
  insertEvent,
  renderEventTitle,
  strikethroughTitle
} from "../src/google-calendar-sync.mjs";
import { DEFAULT_SUBJECT_ICONS } from "../src/subject-icons.mjs";

const baseEvent = {
  summary: "Changed: Math",
  location: "Room 204",
  subjectLabel: "Math",
  subjectName: "Mathematics",
  teacherNames: ["JD (Jane Doe)", "AB (Alan Brown)"],
  classHourNumber: "3"
};

test("renderEventTitle applies the default title format", () => {
  const title = renderEventTitle("({location}) {summary}", baseEvent);
  assert.equal(title, "(Room 204) Changed: Math");
});

test("renderEventTitle drops an empty location's parentheses", () => {
  const title = renderEventTitle("({location}) {summary}", { ...baseEvent, location: "" });
  assert.equal(title, "Changed: Math");
});

test("renderEventTitle supports custom placeholder combinations", () => {
  const title = renderEventTitle("{subject} - {location} ({teachers})", baseEvent);
  assert.equal(title, "Math - Room 204 (Jane Doe, Alan Brown)");
});

test("renderEventTitle falls back to the raw teacher entry without a full name", () => {
  const title = renderEventTitle("{teachers}", { ...baseEvent, teacherNames: ["JD"] });
  assert.equal(title, "JD");
});

test("renderEventTitle leaves unknown placeholders untouched", () => {
  const title = renderEventTitle("{unknown}-{subject}", baseEvent);
  assert.equal(title, "{unknown}-Math");
});

test("renderEventTitle resolves {icon} from the subject name", () => {
  const title = renderEventTitle("{icon} {subject}", baseEvent, {
    iconMapping: DEFAULT_SUBJECT_ICONS
  });
  assert.equal(title, "➗ Math");
});

test("renderEventTitle drops the {icon} placeholder when no icon matches", () => {
  const title = renderEventTitle(
    "{icon} {subject}",
    {
      ...baseEvent,
      subjectName: "Unknown Course",
      subjectLabel: "XYZ"
    },
    { iconMapping: DEFAULT_SUBJECT_ICONS }
  );
  assert.equal(title, "XYZ");
});

test("strikethroughTitle overlays every character with a combining stroke", () => {
  assert.equal(strikethroughTitle("NW"), "N̶W̶");
});

test("strikethroughTitle keeps a multi-codepoint flag emoji intact as one grapheme", () => {
  assert.equal(strikethroughTitle("🇬🇧 Englisch"), "🇬🇧̶ ̶E̶n̶g̶l̶i̶s̶c̶h̶");
});

test("insertEvent revives a tombstoned event after Google returns HTTP 409", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) {
      return new Response(
        JSON.stringify({ error: { message: "The requested identifier already exists" } }),
        { status: 409, headers: { "content-type": "application/json" } }
      );
    }
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const event = { id: "sm123", summary: "Mathematics" };
  try {
    await insertEvent({ accessToken: "synthetic-token", calendarId: "calendar@example.test", event });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.method, "POST");
  assert.match(requests[0].url, /\/events\?sendUpdates=none$/);
  assert.equal(requests[1].options.method, "PUT");
  assert.match(requests[1].url, /\/events\/sm123\?sendUpdates=none$/);
  assert.deepEqual(JSON.parse(requests[1].options.body), event);
});

test("Google Calendar failures do not expose the calendar ID or upstream response", async () => {
  const originalFetch = globalThis.fetch;
  const calendarId = "private-calendar@example.test";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: `Calendar ${calendarId} is unavailable` } }),
      { status: 404, headers: { "content-type": "application/json" } }
    );

  try {
    await assert.rejects(
      insertEvent({
        accessToken: "synthetic-token",
        calendarId,
        event: { id: "sm-private", summary: "Private" }
      }),
      (error) => {
        assert.equal(error.status, 404);
        assert.equal(error.message, "POST Google Calendar request failed with HTTP 404.");
        assert.doesNotMatch(error.message, new RegExp(calendarId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.doesNotMatch(error.message, /private-calendar|calendars|unavailable/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google Calendar fetch exceptions do not expose request URLs", async () => {
  const originalFetch = globalThis.fetch;
  const calendarId = "private-calendar@example.test";
  globalThis.fetch = async (url) => {
    throw new Error(`connect failed for ${url}`);
  };

  try {
    await assert.rejects(
      insertEvent({
        accessToken: "synthetic-token",
        calendarId,
        event: { id: "sm-private", summary: "Private" }
      }),
      (error) => {
        assert.equal(error.message, "POST Google Calendar request failed.");
        assert.doesNotMatch(error.message, /private-calendar|calendars|googleapis/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
