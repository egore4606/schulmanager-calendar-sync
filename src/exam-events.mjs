import { collapseWhitespace, compareEvents } from "./schedule-events.mjs";

export function normalizeExamEvents({ exams, timezone = "Europe/Berlin" }) {
  return exams
    .map((exam) => examToEvent({ exam, timezone }))
    .filter(Boolean)
    .sort(compareEvents);
}

function examToEvent({ exam, timezone }) {
  const startHour = exam.startClassHour;
  const endHour = exam.endClassHour || startHour;

  if (!startHour?.from || !endHour?.until) {
    return null;
  }

  const subjectLabel = collapseWhitespace(
    exam.subject?.abbreviation || exam.subject?.name || exam.subjectText || "Exam"
  );
  const subjectName = exam.subject?.name || exam.subjectText || subjectLabel;
  const examType = exam.type?.name || "Exam";

  const summary = `${examType}: ${subjectLabel}`;
  const description = [
    `${subjectName}${subjectName === subjectLabel ? "" : ` (${subjectLabel})`}`,
    `Type: ${examType}`,
    exam.comment ? `Comment: ${exam.comment}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return {
    uid: `schulmanager-exam-${exam.id}`,
    date: exam.date,
    startTime: startHour.from,
    endTime: endHour.until,
    timezone,
    summary,
    description,
    location: "",
    status: "CONFIRMED",
    classHourNumber: String(startHour.number ?? ""),
    subjectLabel,
    subjectName,
    examType,
    teacherAbbreviations: [],
    teacherNames: [],
    room: "",
    sourceType: "exam",
    cancelled: false,
    changed: false,
    special: false
  };
}
