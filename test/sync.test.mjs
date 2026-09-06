import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { writePrivateJson } from "../src/sync.mjs";

test("writePrivateJson creates and tightens private runtime files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "private-json-"));
  const filePath = path.join(dir, "status.json");
  try {
    await writeFile(filePath, "{}", { mode: 0o644 });
    if (process.platform !== "win32") {
      await chmod(filePath, 0o644);
    }

    await writePrivateJson(filePath, { ok: true });

    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), { ok: true });
    if (process.platform !== "win32") {
      assert.equal((await stat(filePath)).mode & 0o777, 0o600);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
