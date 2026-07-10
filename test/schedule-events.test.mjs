import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScheduleEvents } from "../src/schedule-events.mjs";

const classHours = [
  { id: 1, number: 1, from: "08:00", until: "08:45" },
  { id: 2, number: 2, from: "08:45", until: "09:30" }
];

function lesson({ hour = 1, cancelled = false } = {}) {
  return {
    date: "2026-07-13",
    type: "regularLesson",
    isCancelled: cancelled,
    classHour: { id: hour, number: hour },
    actualLesson: {
      lessonId: 42,
      subjectLabel: "MATH",
      subject: { name: "Mathematics", abbreviation: "MATH" },
      teachers: [{ abbreviation: "AB", firstname: "Ada", lastname: "Byron" }],
      room: { name: "R101" },
      privateStudentData: "must not be persisted"
    }
  };
}

test("normalizes and merges adjacent lessons without persisting raw API data", () => {
  const events = normalizeScheduleEvents({
    lessons: [lesson(), lesson({ hour: 2 })],
    classHours
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].startTime, "08:00");
  assert.equal(events[0].endTime, "09:30");
  assert.equal(events[0].summary, "MATH");
  assert.equal(events[0].location, "R101");
  assert.equal(Object.hasOwn(events[0], "source"), false);
  assert.doesNotMatch(JSON.stringify(events), /privateStudentData/);
});

test("excludes cancelled lessons by default", () => {
  const events = normalizeScheduleEvents({
    lessons: [lesson({ cancelled: true })],
    classHours
  });
  assert.deepEqual(events, []);
});

test("can include cancelled lessons explicitly", () => {
  const events = normalizeScheduleEvents({
    lessons: [lesson({ cancelled: true })],
    classHours,
    includeCancelled: true
  });
  assert.equal(events[0].cancelled, true);
  assert.match(events[0].summary, /^Cancelled:/);
});
