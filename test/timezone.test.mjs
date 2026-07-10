import assert from "node:assert/strict";
import test from "node:test";
import {
  rfc3339WithOffset,
  utcIcsDateTime,
  zonedDateTimeToUtcDate
} from "../src/timezone.mjs";

test("Europe/Berlin winter dates use UTC+01:00", () => {
  assert.equal(
    rfc3339WithOffset("2026-01-15", "08:00", "Europe/Berlin"),
    "2026-01-15T08:00:00+01:00"
  );
  assert.equal(
    zonedDateTimeToUtcDate("2026-01-15", "08:00", "Europe/Berlin").toISOString(),
    "2026-01-15T07:00:00.000Z"
  );
});

test("Europe/Berlin summer dates use UTC+02:00", () => {
  assert.equal(
    rfc3339WithOffset("2026-07-15", "08:00", "Europe/Berlin"),
    "2026-07-15T08:00:00+02:00"
  );
  assert.equal(
    utcIcsDateTime("2026-07-15", "08:00", "Europe/Berlin"),
    "20260715T060000Z"
  );
});
