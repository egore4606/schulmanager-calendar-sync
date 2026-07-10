import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  isoDateInTimeZone,
  resolveSyncRange,
  startOfWeek
} from "../src/date-range.mjs";

test("resolveSyncRange aligns the window to complete Monday-based weeks", () => {
  const range = resolveSyncRange({
    timezone: "Europe/Berlin",
    pastWeeks: 2,
    futureWeeks: 2,
    today: new Date("2026-07-08T12:00:00Z")
  });

  assert.deepEqual(range, { start: "2026-06-22", end: "2026-07-26" });
});

test("date helpers handle Sunday and month boundaries", () => {
  assert.equal(startOfWeek("2026-03-01"), "2026-02-23");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("isoDateInTimeZone uses the configured calendar day", () => {
  const value = isoDateInTimeZone(
    new Date("2026-01-01T00:30:00Z"),
    "America/New_York"
  );
  assert.equal(value, "2025-12-31");
});
