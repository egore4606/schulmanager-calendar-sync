import assert from "node:assert/strict";
import test from "node:test";
import {
  insertEvent,
  renderEventTitle,
  strikethroughTitle
} from "../src/google-calendar-sync.mjs";

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

test("strikethroughTitle overlays every character with a combining stroke", () => {
  assert.equal(strikethroughTitle("NW"), "N̶W̶");
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
