import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeScheduleEvents } from "./schedule-events.mjs";
import { SchulmanagerApi } from "./schulmanager-api.mjs";
import { resolveSyncRange } from "./date-range.mjs";
import { TokenStore } from "./token-store.mjs";

export async function syncSchedule({
  dataDir = process.env.DATA_DIR || "/data",
  timezone = process.env.SCHULMANAGER_TIMEZONE || "Europe/Berlin",
  pastWeeks = Number(process.env.SYNC_PAST_WEEKS || 2),
  futureWeeks = Number(process.env.SYNC_FUTURE_WEEKS || 2),
  includeCancelled = envFlag("SYNC_INCLUDE_CANCELLED"),
  mergeAdjacent = !envFlag("SYNC_NO_MERGE_ADJACENT")
} = {}) {
  await mkdir(dataDir, { recursive: true });

  const tokenStore = new TokenStore(path.join(dataDir, "token-store.json"));
  const token = (await tokenStore.readToken()) || process.env.SCHULMANAGER_TOKEN;
  const api = new SchulmanagerApi({
    token,
    onNewToken: (newToken) => tokenStore.writeToken(newToken)
  });

  const student = await api.getCurrentStudent();
  const range = resolveSyncRange({ timezone, pastWeeks, futureWeeks });
  const { lessons, classHours } = await api.getSchedule({
    ...range,
    student
  });

  const events = normalizeScheduleEvents({
    lessons,
    classHours,
    timezone,
    includeCancelled,
    mergeAdjacent
  });

  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    timezone,
    range,
    eventCount: events.length,
    events
  };

  await writePrivateJson(
    path.join(dataDir, "schedule.json"),
    payload
  );
  await writePrivateJson(
    path.join(dataDir, "status.json"),
    { ok: true, generatedAt, range, eventCount: events.length }
  );

  return payload;
}

export async function writePrivateJson(filePath, value) {
  try {
    await chmod(filePath, 0o600);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  await writeFile(filePath, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
  await chmod(filePath, 0o600);
}

function envFlag(name) {
  return ["1", "true", "yes", "on"].includes(
    String(process.env[name] || "").toLowerCase()
  );
}
