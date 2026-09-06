import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_SUBJECT_ICONS,
  loadSubjectIconMapping,
  subjectIcon
} from "../src/subject-icons.mjs";

function withMappingFile(filePath, fn) {
  const previous = process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE;
  process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE = filePath;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE;
    } else {
      process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE = previous;
    }
  }
}

function captureErrors(fn) {
  const originalError = console.error;
  const messages = [];
  console.error = (message) => messages.push(message);
  try {
    fn();
  } finally {
    console.error = originalError;
  }
  return messages;
}

test("subjectIcon creates the mapping file from the built-in defaults when missing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "subject-icons-"));
  const filePath = path.join(dir, "nested", "subject-icons.json");
  try {
    withMappingFile(filePath, () => {
      assert.equal(subjectIcon("Mathematics", "Math"), "➗");
    });
    const written = JSON.parse(readFileSync(filePath, "utf8"));
    assert.deepEqual(written, DEFAULT_SUBJECT_ICONS);
    if (process.platform !== "win32") {
      assert.equal(statSync(filePath).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadSubjectIconMapping tightens an existing default mapping file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "subject-icons-"));
  const filePath = path.join(dir, "subject-icons.json");
  const previousDataDir = process.env.DATA_DIR;
  const previousCustomPath = process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE;
  delete process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE;
  process.env.DATA_DIR = dir;
  writeFileSync(filePath, JSON.stringify({ default: "📚" }), { mode: 0o644 });
  try {
    assert.deepEqual(loadSubjectIconMapping(), { default: "📚" });
    if (process.platform !== "win32") {
      assert.equal(statSync(filePath).mode & 0o777, 0o600);
    }
  } finally {
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previousDataDir;
    }
    if (previousCustomPath === undefined) {
      delete process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE;
    } else {
      process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE = previousCustomPath;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("subjectIcon matches a wildcard pattern from the mapping file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "subject-icons-"));
  const filePath = path.join(dir, "subject-icons.json");
  writeFileSync(filePath, JSON.stringify({ "Bio*": "🧬", default: "" }));
  try {
    withMappingFile(filePath, () => {
      assert.equal(subjectIcon("Biologie", "Bio"), "🧬");
      assert.equal(subjectIcon("Unknown", "XYZ"), "");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("subjectIcon falls back to the short label when the full name is unmatched", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "subject-icons-"));
  const filePath = path.join(dir, "subject-icons.json");
  writeFileSync(filePath, JSON.stringify({ "Sport*": "⚽", default: "" }));
  try {
    withMappingFile(filePath, () => {
      assert.equal(subjectIcon("Unknown Course", "Sport"), "⚽");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("subjectIcon uses the mapping file's default key for unmatched subjects", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "subject-icons-"));
  const filePath = path.join(dir, "subject-icons.json");
  writeFileSync(filePath, JSON.stringify({ default: "📚" }));
  try {
    withMappingFile(filePath, () => {
      assert.equal(subjectIcon("Unknown Course", "XYZ"), "📚");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("subjectIcon falls back to built-in defaults when the mapping file is invalid JSON", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "subject-icons-"));
  const filePath = path.join(dir, "subject-icons.json");
  writeFileSync(filePath, "{not json");
  try {
    withMappingFile(filePath, () => {
      const messages = captureErrors(() => {
        assert.equal(subjectIcon("Mathematics", "Math"), "➗");
      });
      assert.match(messages[0], /falling back to built-in defaults/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadSubjectIconMapping rejects valid JSON with an unsafe shape", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "subject-icons-"));
  const filePath = path.join(dir, "subject-icons.json");
  writeFileSync(filePath, "null");
  try {
    withMappingFile(filePath, () => {
      let mapping;
      const messages = captureErrors(() => {
        mapping = loadSubjectIconMapping();
      });
      assert.equal(mapping, DEFAULT_SUBJECT_ICONS);
      assert.equal(subjectIcon("Mathematics", "Math", mapping), "➗");
      assert.match(messages[0], /mapping must be a JSON object with string icon values/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
