import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_SUBJECT_ICONS = {
  "Mathe*": "➗",
  "Deutsch*": "📖",
  "Englisch*": "🇬🇧",
  "Franz*sisch*": "🇫🇷",
  "Spanisch*": "🇪🇸",
  "Latein*": "📜",
  "Bio*": "🧬",
  "Chem*": "🧪",
  "Phys*": "⚛️",
  "Inform*": "💻",
  "Erdkunde*": "🌍",
  "Geographie*": "🌍",
  "Geografie*": "🌍",
  "Geschichte*": "🏺",
  "Politik*": "🏦",
  "Sowi*": "🏦",
  "Sozialkunde*": "🏦",
  "Gemeinschaftskunde*": "🏦",
  "Gesellschaftslehre*": "🏦",
  "PGW*": "🏦",
  "Religion*": "🙏",
  "*Religion*": "🙏",
  "Reli*": "🙏",
  "Ethik*": "⚖️",
  "Philosophie*": "🧠",
  "Kunst*": "🎨",
  "Musik*": "🎵",
  "Sport*": "⚽",
  "Wirtschaft*": "💰",
  "Technik*": "🔧",
  "Werken*": "🔨",
  "WAT*": "🔨",
  "Darstellendes Spiel*": "🎭",
  "Naturwissenschaften*": "🔬",
  "Arbeitslehre*": "🛠️",
  "Klassenlehrerunterricht*": "🧑‍🏫",
  "Klassenlehrer-AG*": "🧩",
  "Lernzeit*": "📝",
  "Einschulung*": "🎒",
  default: ""
};

export function subjectIcon(subjectName, subjectLabel, mapping = loadSubjectIconMapping()) {
  const { default: fallback = "", ...patterns } = mapping;

  for (const candidate of [subjectName, subjectLabel]) {
    const trimmed = candidate?.trim();
    if (!trimmed) {
      continue;
    }
    const match = Object.entries(patterns).find(([pattern]) =>
      wildcardToRegExp(pattern).test(trimmed)
    );
    if (match) {
      return match[1];
    }
  }

  return fallback;
}

function mappingFilePath() {
  const dataDir = process.env.DATA_DIR || "/data";
  return process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE || path.join(dataDir, "subject-icons.json");
}

export function loadSubjectIconMapping() {
  const filePath = mappingFilePath();
  const usesDefaultPath = !process.env.GOOGLE_CALENDAR_SUBJECT_ICONS_FILE;
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    try {
      writeFileSync(filePath, `${JSON.stringify(DEFAULT_SUBJECT_ICONS, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
    } catch (writeError) {
      if (writeError.code !== "EEXIST") {
        throw writeError;
      }
      if (usesDefaultPath) {
        chmodSync(filePath, 0o600);
      }
    }
    const mapping = JSON.parse(readFileSync(filePath, "utf8"));
    if (
      !mapping ||
      Array.isArray(mapping) ||
      typeof mapping !== "object" ||
      Object.values(mapping).some((icon) => typeof icon !== "string")
    ) {
      throw new TypeError("mapping must be a JSON object with string icon values");
    }
    return mapping;
  } catch (error) {
    console.error(
      `Could not load subject icon mapping from ${filePath}, falling back to built-in defaults: ${error.message}`
    );
    return DEFAULT_SUBJECT_ICONS;
  }
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}
