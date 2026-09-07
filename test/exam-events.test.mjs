import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExamEvents } from "../src/exam-events.mjs";

function exam({ id = 1, endClassHour = null, comment = null } = {}) {
  return {
    id,
    date: "2026-09-22",
    startClassHour: { id: 15873, number: "5", from: "11:25:00", until: "12:10:00" },
    endClassHour,
    subject: { id: 134839, name: "Mathematik", abbreviation: "M" },
    subjectText: null,
    type: { id: 813, name: "Klassenarbeiten", color: "#c6dcef", visibleForStudents: true },
    comment,
    createdAt: "2026-09-04T11:31:35.751Z",
    updatedAt: "2026-09-04T11:31:35.751Z"
  };
}

test("normalizes an exam spanning a single class hour", () => {
  const events = normalizeExamEvents({ exams: [exam()] });

  assert.equal(events.length, 1);
  assert.equal(events[0].uid, "schulmanager-exam-1");
  assert.equal(events[0].startTime, "11:25:00");
  assert.equal(events[0].endTime, "12:10:00");
  assert.equal(events[0].summary, "Klassenarbeiten: M");
  assert.equal(events[0].sourceType, "exam");
});

test("normalizes an exam spanning multiple class hours", () => {
  const events = normalizeExamEvents({
    exams: [
      exam({ endClassHour: { id: 15874, number: "6", from: "12:15:00", until: "13:00:00" } })
    ]
  });

  assert.equal(events[0].startTime, "11:25:00");
  assert.equal(events[0].endTime, "13:00:00");
});

test("includes the comment in the description when present", () => {
  const events = normalizeExamEvents({
    exams: [exam({ comment: "Taschenrechner mitbringen" })]
  });

  assert.match(events[0].description, /Taschenrechner mitbringen/);
});

test("omits the comment line when null", () => {
  const events = normalizeExamEvents({ exams: [exam({ comment: null })] });

  assert.doesNotMatch(events[0].description, /Comment:/);
});

test("skips exams missing class hour times", () => {
  const broken = exam();
  broken.startClassHour = { id: 1 };
  const events = normalizeExamEvents({ exams: [broken] });

  assert.deepEqual(events, []);
});
