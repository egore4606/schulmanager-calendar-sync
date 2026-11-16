import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  buildDesiredGoogleEvents,
  isKeepPastEventsEnabled,
  isPastGoogleEvent,
  pushGoogleCalendar,
  shouldDeleteManagedEvent
} from "../src/google-calendar-sync.mjs";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

function withEnv(vars, fn) {
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("keeps cancelled events that were explicitly included upstream", () => {
  const desiredEvents = withEnv(
    { GOOGLE_CALENDAR_TITLE_TEMPLATE: "({location}) {summary}" },
    () =>
      buildDesiredGoogleEvents([
        {
          uid: "2026-07-13:1:cancelled-lesson",
          date: "2026-07-13",
          startTime: "08:00",
          endTime: "08:45",
          timezone: "Europe/Berlin",
          summary: "Cancelled: Mathematics",
          location: "R101",
          cancelled: true
        }
      ])
  );

  assert.equal(desiredEvents.size, 1);
  assert.equal([...desiredEvents.values()][0].summary, "(R101) Cancelled: Mathematics");
});

test("isKeepPastEventsEnabled reads GOOGLE_CALENDAR_KEEP_PAST_EVENTS", () => {
  withEnv({ GOOGLE_CALENDAR_KEEP_PAST_EVENTS: undefined }, () => {
    assert.equal(isKeepPastEventsEnabled(), false);
  });
  withEnv({ GOOGLE_CALENDAR_KEEP_PAST_EVENTS: "false" }, () => {
    assert.equal(isKeepPastEventsEnabled(), false);
  });
  withEnv({ GOOGLE_CALENDAR_KEEP_PAST_EVENTS: "true" }, () => {
    assert.equal(isKeepPastEventsEnabled(), true);
  });
  withEnv({ GOOGLE_CALENDAR_KEEP_PAST_EVENTS: "1" }, () => {
    assert.equal(isKeepPastEventsEnabled(), true);
  });
});

test("isPastGoogleEvent compares the event date against today in the configured timezone", () => {
  const today = new Date("2026-09-22T10:00:00Z");

  assert.equal(
    isPastGoogleEvent(
      {
        start: { dateTime: "2026-09-21T08:00:00+02:00", timeZone: "Europe/Berlin" },
        end: { dateTime: "2026-09-21T08:45:00+02:00", timeZone: "Europe/Berlin" }
      },
      { timezone: "Europe/Berlin", today }
    ),
    true
  );

  assert.equal(
    isPastGoogleEvent(
      {
        start: { dateTime: "2026-09-22T08:00:00+02:00", timeZone: "Europe/Berlin" },
        end: { dateTime: "2026-09-22T08:45:00+02:00", timeZone: "Europe/Berlin" }
      },
      { timezone: "Europe/Berlin", today }
    ),
    false
  );

  assert.equal(
    isPastGoogleEvent(
      {
        start: { dateTime: "2026-09-23T08:00:00+02:00", timeZone: "Europe/Berlin" },
        end: { dateTime: "2026-09-23T08:45:00+02:00", timeZone: "Europe/Berlin" }
      },
      { timezone: "Europe/Berlin", today }
    ),
    false
  );

  assert.equal(
    isPastGoogleEvent(
      {
        extendedProperties: {
          private: { schulmanagerUid: "schulmanager-2026-09-15-1-regularLesson-10" }
        }
      },
      { timezone: "Europe/Berlin", today }
    ),
    true
  );
});

test("shouldDeleteManagedEvent preserves past events only when keepPastEvents is enabled", () => {
  const today = new Date("2026-09-22T10:00:00Z");
  const desiredEvents = new Map([["sm-keep", { id: "sm-keep" }]]);
  const pastEvent = {
    id: "sm-past",
    start: { dateTime: "2026-09-20T08:00:00+02:00", timeZone: "Europe/Berlin" },
    end: { dateTime: "2026-09-20T08:45:00+02:00", timeZone: "Europe/Berlin" }
  };
  const todayEvent = {
    id: "sm-today",
    start: { dateTime: "2026-09-22T08:00:00+02:00", timeZone: "Europe/Berlin" },
    end: { dateTime: "2026-09-22T08:45:00+02:00", timeZone: "Europe/Berlin" }
  };
  const futureEvent = {
    id: "sm-future",
    start: { dateTime: "2026-09-25T08:00:00+02:00", timeZone: "Europe/Berlin" },
    end: { dateTime: "2026-09-25T08:45:00+02:00", timeZone: "Europe/Berlin" }
  };
  const desiredEvent = {
    id: "sm-keep",
    start: { dateTime: "2026-09-20T08:00:00+02:00", timeZone: "Europe/Berlin" },
    end: { dateTime: "2026-09-20T08:45:00+02:00", timeZone: "Europe/Berlin" }
  };

  assert.equal(
    shouldDeleteManagedEvent(pastEvent, {
      desiredEvents,
      keepPastEvents: false,
      timezone: "Europe/Berlin",
      today
    }),
    true
  );

  assert.equal(
    shouldDeleteManagedEvent(pastEvent, {
      desiredEvents,
      keepPastEvents: true,
      timezone: "Europe/Berlin",
      today
    }),
    false
  );

  assert.equal(
    shouldDeleteManagedEvent(todayEvent, {
      desiredEvents,
      keepPastEvents: true,
      timezone: "Europe/Berlin",
      today
    }),
    true
  );

  assert.equal(
    shouldDeleteManagedEvent(futureEvent, {
      desiredEvents,
      keepPastEvents: true,
      timezone: "Europe/Berlin",
      today
    }),
    true
  );

  assert.equal(
    shouldDeleteManagedEvent(desiredEvent, {
      desiredEvents,
      keepPastEvents: false,
      timezone: "Europe/Berlin",
      today
    }),
    false
  );
});

test("pushGoogleCalendar keeps past events and deletes obsolete future events when GOOGLE_CALENDAR_KEEP_PAST_EVENTS=true", async () => {
  const originalFetch = globalThis.fetch;
  const deletedIds = [];

  globalThis.fetch = async (url, options = {}) => {
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({ access_token: "synthetic-token", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (options.method === undefined || options.method === "GET") {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "sm-past-removed",
              summary: "Math",
              start: { dateTime: "2026-09-14T08:00:00+02:00", timeZone: "Europe/Berlin" },
              end: { dateTime: "2026-09-14T08:45:00+02:00", timeZone: "Europe/Berlin" },
              status: "confirmed",
              extendedProperties: {
                private: {
                  managedBy: "schulmanager-calendar-sync",
                  schulmanagerUid: "schulmanager-2026-09-14-1-regularLesson-1"
                }
              }
            },
            {
              id: "sm-future-removed",
              summary: "English",
              start: { dateTime: "2026-09-24T09:00:00+02:00", timeZone: "Europe/Berlin" },
              end: { dateTime: "2026-09-24T09:45:00+02:00", timeZone: "Europe/Berlin" },
              status: "confirmed",
              extendedProperties: {
                private: {
                  managedBy: "schulmanager-calendar-sync",
                  schulmanagerUid: "schulmanager-2026-09-24-2-regularLesson-2"
                }
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (options.method === "DELETE") {
      const match = String(url).match(/\/events\/([^?]+)/);
      deletedIds.push(match?.[1]);
      return new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected request: ${options.method} ${url}`);
  };

  try {
    await withEnv(
      {
        GOOGLE_CALENDAR_ID: "synthetic-calendar@example.test",
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "sync@example.test",
          private_key: privateKey
        }),
        GOOGLE_CALENDAR_TITLE_TEMPLATE: "{summary}",
        GOOGLE_CALENDAR_KEEP_PAST_EVENTS: "true"
      },
      async () => {
        const result = await pushGoogleCalendar({
          events: [],
          range: { start: "2026-09-07", end: "2026-10-04" },
          timezone: "Europe/Berlin",
          today: new Date("2026-09-22T10:00:00Z"),
          logger: { log() {} }
        });

        assert.equal(result.deleted, 1);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(deletedIds, ["sm-future-removed"]);
});
