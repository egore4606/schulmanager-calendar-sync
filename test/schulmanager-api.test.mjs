import assert from "node:assert/strict";
import test from "node:test";
import {
  extractBundleVersion,
  extractImportedScriptUrls
} from "../src/schulmanager-api.mjs";

test("extractBundleVersion resolves the referenced build identifier", () => {
  const source = 'const buildId="abcDEF_123"; const config={bundleVersion:buildId};';
  assert.equal(extractBundleVersion(source), "abcDEF_123");
});

test("extractImportedScriptUrls resolves relative static and dynamic imports", () => {
  const urls = extractImportedScriptUrls(
    'import value from "./chunk-a.js"; import("/assets/chunk-b.js");',
    "https://example.test/assets/main.js"
  );
  assert.deepEqual(urls, [
    "https://example.test/assets/chunk-a.js",
    "https://example.test/assets/chunk-b.js"
  ]);
});
