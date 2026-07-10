#!/usr/bin/env node
import http from "node:http";
import {
  isGoogleCalendarSyncEnabled,
  pushGoogleCalendar
} from "./src/google-calendar-sync.mjs";
import { syncSchedule } from "./src/sync.mjs";

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || "/data";
const INTERVAL_MINUTES = Number(process.env.SYNC_INTERVAL_MINUTES || 30);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
if (!Number.isFinite(INTERVAL_MINUTES) || INTERVAL_MINUTES <= 0) {
  throw new Error("SYNC_INTERVAL_MINUTES must be greater than zero.");
}

let lastStatus = {
  ok: false,
  startedAt: null,
  finishedAt: null,
  error: "Initial sync has not run yet."
};
let syncPromise = null;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/health" && ["GET", "HEAD"].includes(request.method)) {
      sendJson(response, lastStatus.ok ? 200 : 503, lastStatus);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Schulmanager calendar server listening on :${PORT}`);
});

scheduleSync();
setInterval(scheduleSync, INTERVAL_MINUTES * 60 * 1000);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`${signal} received; closing health server.`);
    server.close(() => process.exit(0));
  });
}

function scheduleSync() {
  if (syncPromise) {
    console.log("Previous sync is still running; skipping this tick.");
    return;
  }

  syncPromise = runSync().finally(() => {
    syncPromise = null;
  });
}

async function runSync() {
  const startedAt = new Date().toISOString();
  console.log(`Sync started at ${startedAt}`);

  try {
    const result = await syncSchedule({ dataDir: DATA_DIR });
    const googleCalendar = isGoogleCalendarSyncEnabled()
      ? await pushGoogleCalendar({
          events: result.events,
          range: result.range
        })
      : null;
    lastStatus = {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      range: result.range,
      eventCount: result.eventCount,
      ...(googleCalendar ? { googleCalendar } : {})
    };
    console.log(
      `Sync finished: ${result.eventCount} events (${result.range.start} to ${result.range.end})`
    );
  } catch (error) {
    lastStatus = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error.message
    };
    console.error("Sync failed:", error);
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}
