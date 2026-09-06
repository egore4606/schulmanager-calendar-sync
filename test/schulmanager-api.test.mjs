import assert from "node:assert/strict";
import test from "node:test";
import {
  SchulmanagerApi,
  discoverBundleVersion,
  extractBundleVersion,
  extractImportedScriptUrls
} from "../src/schulmanager-api.mjs";

function fakeFetch(user) {
  return async () =>
    new Response(JSON.stringify({ isAuthenticated: true, user }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
}

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

test("extractImportedScriptUrls excludes protocol-relative cross-origin imports", () => {
  const urls = extractImportedScriptUrls(
    'import("//internal.example/chunk.js"); import("./safe.js");',
    "https://school.example/assets/main.js"
  );
  assert.deepEqual(urls, ["https://school.example/assets/safe.js"]);
});

test("discoverBundleVersion does not fetch cross-origin scripts", async () => {
  const fetched = [];
  const version = await discoverBundleVersion("https://school.example", async (url, options) => {
    fetched.push({ url, options });
    if (url === "https://school.example/") {
      return new Response(
        '<script src="https://internal.example/private.js"></script><script src="/main.js"></script>'
      );
    }
    return new Response('const build="safe_123"; const app={bundleVersion:build};');
  });

  assert.equal(version, "safe_123");
  assert.deepEqual(fetched.map(({ url }) => url), [
    "https://school.example/",
    "https://school.example/main.js"
  ]);
  assert.ok(fetched.every(({ options }) => options.redirect === "manual"));
});

test("discoverBundleVersion refuses a cross-origin redirect before following it", async () => {
  const fetched = [];
  await assert.rejects(
    discoverBundleVersion("https://school.example", async (url) => {
      fetched.push(url);
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" }
      });
    }),
    /refused a cross-origin request/
  );
  assert.deepEqual(fetched, ["https://school.example/"]);
});

test("discoverBundleVersion follows bounded same-origin redirects", async () => {
  const fetched = [];
  const version = await discoverBundleVersion("https://school.example", async (url) => {
    fetched.push(url);
    if (url === "https://school.example/") {
      return new Response(null, { status: 302, headers: { location: "/app/" } });
    }
    if (url === "https://school.example/app/") {
      return new Response('<script src="main.js"></script>');
    }
    return new Response('const build="redirect_123"; const app={bundleVersion:build};');
  });

  assert.equal(version, "redirect_123");
  assert.deepEqual(fetched, [
    "https://school.example/",
    "https://school.example/app/",
    "https://school.example/app/main.js"
  ]);
});

test("discoverBundleVersion resolves imports from a redirected script URL", async () => {
  const fetched = [];
  const version = await discoverBundleVersion("https://school.example", async (url) => {
    fetched.push(url);
    if (url === "https://school.example/") {
      return new Response('<script src="/main.js"></script>');
    }
    if (url === "https://school.example/main.js") {
      return new Response(null, {
        status: 302,
        headers: { location: "/assets/main.js" }
      });
    }
    if (url === "https://school.example/assets/main.js") {
      return new Response('import("./chunk.js");');
    }
    return new Response('const build="import_123"; const app={bundleVersion:build};');
  });

  assert.equal(version, "import_123");
  assert.deepEqual(fetched, [
    "https://school.example/",
    "https://school.example/main.js",
    "https://school.example/assets/main.js",
    "https://school.example/assets/chunk.js"
  ]);
});

test("getCurrentStudent returns the directly associated student", async () => {
  const api = new SchulmanagerApi({
    token: "test-token",
    fetchImpl: fakeFetch({ associatedStudent: { id: 42 } })
  });
  assert.deepEqual(await api.getCurrentStudent(), { id: 42 });
});

test("getCurrentStudent falls back to the first child of a parent account", async () => {
  const api = new SchulmanagerApi({
    token: "test-token",
    fetchImpl: fakeFetch({
      associatedStudent: null,
      associatedParents: [{ id: 1, student: { id: 7 } }, { id: 2, student: { id: 8 } }]
    })
  });
  assert.deepEqual(await api.getCurrentStudent(), { id: 7 });
});

test("getCurrentStudent lets SCHULMANAGER_STUDENT_ID select a specific child", async () => {
  const api = new SchulmanagerApi({
    token: "test-token",
    fetchImpl: fakeFetch({
      associatedStudent: null,
      associatedParents: [{ id: 1, student: { id: 7 } }, { id: 2, student: { id: 8 } }]
    })
  });
  process.env.SCHULMANAGER_STUDENT_ID = "8";
  try {
    assert.deepEqual(await api.getCurrentStudent(), { id: 8 });
  } finally {
    delete process.env.SCHULMANAGER_STUDENT_ID;
  }
});

test("getCurrentStudent falls back to SCHULMANAGER_STUDENT_ID when discovery fails", async () => {
  const api = new SchulmanagerApi({
    token: "test-token",
    fetchImpl: fakeFetch({ associatedStudent: null })
  });
  process.env.SCHULMANAGER_STUDENT_ID = "99";
  try {
    assert.deepEqual(await api.getCurrentStudent(), { id: 99 });
  } finally {
    delete process.env.SCHULMANAGER_STUDENT_ID;
  }
});
