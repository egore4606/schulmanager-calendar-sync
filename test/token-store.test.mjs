import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TokenStore } from "../src/token-store.mjs";

test("TokenStore returns null for a missing token and persists refreshed tokens", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "schulmanager-token-test-"));
  const filePath = path.join(directory, "nested", "token-store.json");
  const store = new TokenStore(filePath);

  try {
    assert.equal(await store.readToken(), null);
    await store.writeToken("replacement-token");
    assert.equal(await store.readToken(), "replacement-token");

    const payload = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(payload.token, "replacement-token");
    assert.match(payload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
