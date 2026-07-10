export function normalizeScheduleEvents({
  lessons,
  classHours,
  timezone = "Europe/Berlin",
  includeCancelled = false,
  mergeAdjacent = true
}) {
  const hoursById = new Map(classHours.map((hour) => [hour.id, hour]));
  const rawEvents = [];

  for (const lesson of lessons) {
    if (lesson.isCancelled && !includeCancelled) {
      continue;
    }

    const classHour = hoursById.get(lesson.classHour?.id);
    if (!classHour) {
      continue;
    }

    const event = lessonToEvent({ lesson, classHour, timezone });
    if (event) {
      rawEvents.push(event);
    }
  }

  rawEvents.sort(compareEvents);
  const slotEvents = collapseSameSlotEvents(rawEvents);

  const normalizedEvents = mergeAdjacent
    ? mergeAdjacentEvents(slotEvents)
    : slotEvents;

  // Raw Schulmanager responses can contain personal and account-specific data.
  // Keep them only while merging and never persist them in schedule.json.
  return normalizedEvents.map(({ source: _source, ...event }) => event);
}

function lessonToEvent({ lesson, classHour, timezone }) {
  const actual = lesson.actualLesson;
  const original = lesson.originalLessons?.[0];
  const source = actual || original;

  if (!source) {
    return null;
  }

  const dayIndex = isoDateToMondayBasedDayIndex(lesson.date);
  const from = selectDayTime(classHour.fromByDay, dayIndex) || classHour.from;
  const until = selectDayTime(classHour.untilByDay, dayIndex) || classHour.until;

  if (!from || !until) {
    return null;
  }

  const subjectLabel = collapseWhitespace(
    actual?.subjectLabel || original?.subjectLabel || source.subject?.abbreviation || "Lesson"
  );
  const subjectName = source.subject?.name || subjectLabel;
  const teachers = (source.teachers || []).map(formatTeacher).filter(Boolean);
  const room = source.room?.name || "";
  const classHourNumber = lesson.classHour?.number || classHour.number;
  const cancelled = Boolean(lesson.isCancelled);
  const changed = lesson.type === "changedLesson" || lesson.isSubstitution;
  const special = lesson.type === "specialLesson" || lesson.isNew;

  const prefixes = [];
  if (cancelled) {
    prefixes.push("Cancelled");
  } else if (changed) {
    prefixes.push("Changed");
  } else if (special) {
    prefixes.push("Special");
  }

  const summary = [prefixes.length ? `${prefixes.join(" ")}:` : "", subjectLabel]
    .filter(Boolean)
    .join(" ");

  const description = [
    `${subjectName}${subjectName === subjectLabel ? "" : ` (${subjectLabel})`}`,
    teachers.length ? `Teachers: ${teachers.join(", ")}` : null,
    room ? `Room: ${room}` : null,
    `Class hour: ${classHourNumber}`,
    lesson.comment ? `Comment: ${lesson.comment}` : null,
    changed && original
      ? `Original: ${collapseWhitespace(original.subjectLabel || original.subject?.name || "")} ${original.room?.name || ""}`.trim()
      : null,
    `Schulmanager type: ${lesson.type}`
  ]
    .filter(Boolean)
    .join("\n");

  return {
    uid: buildSourceUid(lesson),
    date: lesson.date,
    startTime: from,
    endTime: until,
    timezone,
    summary,
    description,
    location: room,
    status: cancelled ? "CANCELLED" : "CONFIRMED",
    classHourNumber: String(classHourNumber),
    subjectLabel,
    subjectName,
    teacherAbbreviations: (source.teachers || [])
      .map((teacher) => teacher.abbreviation)
      .filter(Boolean),
    teacherNames: teachers,
    room,
    sourceType: lesson.type,
    cancelled,
    changed,
    special,
    source: lesson
  };
}

function mergeAdjacentEvents(events) {
  const merged = [];

  for (const event of events) {
    const previous = merged[merged.length - 1];
    if (previous && canMerge(previous, event)) {
      previous.endTime = event.endTime;
      previous.uid = stableMergedUid(previous, event);
      previous.classHourNumber = `${previous.classHourNumber}-${event.classHourNumber}`;
      previous.description = mergeDescriptions(previous.description, event.description);
      previous.source = [...asArray(previous.source), event.source];
    } else {
      merged.push({ ...event });
    }
  }

  return merged;
}

function collapseSameSlotEvents(events) {
  const collapsed = [];

  for (const event of events) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && canCollapseSameSlot(previous, event)) {
      previous.teacherAbbreviations = unique([
        ...previous.teacherAbbreviations,
        ...event.teacherAbbreviations
      ]);
      previous.teacherNames = unique([...previous.teacherNames, ...event.teacherNames]);
      previous.description = mergeDescriptions(previous.description, event.description);
      previous.uid = stableSlotUid(previous);
      previous.source = [...asArray(previous.source), event.source];
    } else {
      collapsed.push({ ...event });
    }
  }

  return collapsed;
}

function canCollapseSameSlot(left, right) {
  return (
    left.date === right.date &&
    left.startTime === right.startTime &&
    left.endTime === right.endTime &&
    left.summary === right.summary &&
    left.location === right.location &&
    left.status === right.status &&
    left.sourceType === right.sourceType
  );
}

function canMerge(left, right) {
  return (
    left.date === right.date &&
    left.endTime === right.startTime &&
    left.summary === right.summary &&
    left.location === right.location &&
    left.status === right.status &&
    left.sourceType === right.sourceType &&
    left.teacherAbbreviations.join("|") === right.teacherAbbreviations.join("|")
  );
}

function stableSlotUid(event) {
  return [
    "schulmanager",
    event.date,
    event.startTime,
    event.endTime,
    slug(event.summary),
    slug(event.location)
  ].join("-");
}

function stableMergedUid(left, right) {
  return [
    "schulmanager",
    left.date,
    left.startTime,
    right.endTime,
    slug(left.summary),
    slug(left.location)
  ].join("-");
}

function buildSourceUid(lesson) {
  const source = lesson.actualLesson || lesson.originalLessons?.[0] || {};
  const sourceId =
    source.substitutionId ||
    lesson.substitutionId ||
    source.lessonId ||
    lesson.lessonId ||
    source.courseId ||
    "unknown";

  return [
    "schulmanager",
    lesson.date,
    lesson.classHour?.number || lesson.classHour?.id || "hour",
    lesson.type,
    sourceId
  ].join("-");
}

function selectDayTime(values, dayIndex) {
  return Array.isArray(values) ? values[dayIndex] : null;
}

function isoDateToMondayBasedDayIndex(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function formatTeacher(teacher) {
  const fullName = [teacher.firstname, teacher.lastname].filter(Boolean).join(" ");
  if (teacher.abbreviation && fullName) {
    return `${teacher.abbreviation} (${fullName})`;
  }
  return teacher.abbreviation || fullName;
}

function compareEvents(left, right) {
  return (
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.summary.localeCompare(right.summary)
  );
}

function mergeDescriptions(left, right) {
  if (left === right) {
    return left;
  }
  return `${left}\n\n---\n${right}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function collapseWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
