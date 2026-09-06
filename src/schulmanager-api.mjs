const DEFAULT_BASE_URL = "https://login.schulmanager-online.de";

export class SchulmanagerApi {
  constructor({
    token,
    baseUrl = process.env.SCHULMANAGER_BASE_URL || DEFAULT_BASE_URL,
    bundleVersion = process.env.SCHULMANAGER_BUNDLE_VERSION,
    fetchImpl = globalThis.fetch,
    onNewToken = null
  } = {}) {
    if (!token) {
      throw new Error("Missing SCHULMANAGER_TOKEN.");
    }
    if (!fetchImpl) {
      throw new Error("This script requires Node.js 20+ with global fetch.");
    }

    this.token = token;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.bundleVersion = bundleVersion;
    this.fetch = fetchImpl;
    this.onNewToken = onNewToken;
  }

  async getLoginStatus() {
    return await this.#postJson("/api/login-status", {}, "login-status");
  }

  async getCurrentStudent() {
    const status = await this.getLoginStatus();
    const user = status?.user;
    const studentId = process.env.SCHULMANAGER_STUDENT_ID;

    // An explicit ID must win over auto-discovery so parent accounts with
    // multiple children can select the intended student.
    if (studentId) {
      return { id: Number(studentId) };
    }

    const directStudent = user?.associatedStudent;
    if (directStudent?.id) {
      return directStudent;
    }

    // Parent accounts have no associatedStudent of their own; the linked
    // children are listed under associatedParents[*].student instead.
    const parentStudent = user?.associatedParents?.[0]?.student;
    if (parentStudent?.id) {
      return parentStudent;
    }

    throw new Error(
      "Could not discover associated student. Set SCHULMANAGER_STUDENT_ID."
    );
  }

  async getSchedule({ start, end, student }) {
    const bundleVersion = await this.getBundleVersion();
    const payload = {
      bundleVersion,
      requests: [
        {
          moduleName: "schedules",
          endpointName: "get-actual-lessons",
          parameters: {
            student,
            start,
            end
          }
        },
        {
          moduleName: "schedules",
          endpointName: "get-class-hours"
        }
      ]
    };

    const json = await this.#postJson(
      "/api/calls",
      payload,
      "schedules/get-actual-lessons"
    );
    const [lessonsResult, classHoursResult] = json.results || [];

    if (lessonsResult?.status !== 200) {
      throw new Error(
        `get-actual-lessons failed with status ${lessonsResult?.status ?? "unknown"}.`
      );
    }
    if (classHoursResult?.status !== 200) {
      throw new Error(
        `get-class-hours failed with status ${classHoursResult?.status ?? "unknown"}.`
      );
    }

    return {
      lessons: lessonsResult.data || [],
      classHours: classHoursResult.data || []
    };
  }

  async getBundleVersion() {
    if (this.bundleVersion) {
      return this.bundleVersion;
    }

    this.bundleVersion = await discoverBundleVersion(this.baseUrl, this.fetch);
    return this.bundleVersion;
  }

  setToken(token) {
    this.token = token;
  }

  async #postJson(path, payload, label) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify(payload)
    });

    const newToken = response.headers.get("x-new-bearer-token");
    if (newToken && newToken !== this.token) {
      this.token = newToken;
      await this.onNewToken?.(newToken);
    }

    return await parseJsonResponse(response, label);
  }

  #headers() {
    return {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      authorization: `Bearer ${this.token}`
    };
  }
}

export async function discoverBundleVersion(baseUrl, fetchImpl = globalThis.fetch) {
  const root = baseUrl.replace(/\/+$/, "");
  const allowedOrigin = httpOrigin(root);
  const { response: htmlResponse, effectiveUrl: htmlUrl } = await fetchSameOrigin(
    `${root}/`,
    allowedOrigin,
    fetchImpl
  );
  const html = await htmlResponse.text();
  const queue = unique(
    [...html.matchAll(/(?:src|href)=["']([^"']+\.js)["']/g)].map((match) =>
      new URL(match[1], htmlUrl).toString()
    ).filter((url) => isSameHttpOrigin(url, allowedOrigin))
  );

  if (queue.length === 0) {
    throw new Error(
      "Could not find frontend scripts to discover SCHULMANAGER_BUNDLE_VERSION."
    );
  }

  const seen = new Set();
  const checked = [];
  while (queue.length > 0 && seen.size < 250) {
    const scriptUrl = queue.shift();
    if (seen.has(scriptUrl)) {
      continue;
    }
    seen.add(scriptUrl);

    const { response, effectiveUrl } = await fetchSameOrigin(
      scriptUrl,
      allowedOrigin,
      fetchImpl
    );
    if (!response.ok) {
      continue;
    }

    const text = await response.text();
    const version = extractBundleVersion(text);
    checked.push(scriptUrl);
    if (version) {
      return version;
    }

    for (const importedUrl of extractImportedScriptUrls(text, effectiveUrl)) {
      if (!seen.has(importedUrl)) {
        queue.push(importedUrl);
      }
    }
  }

  throw new Error(
    `Could not discover SCHULMANAGER_BUNDLE_VERSION. Checked ${checked.length} scripts.`
  );
}

export function extractImportedScriptUrls(scriptText, scriptUrl) {
  const allowedOrigin = httpOrigin(scriptUrl);
  const imports = [
    ...scriptText.matchAll(/\bfrom\s*["']([^"']+\.js)["']/g),
    ...scriptText.matchAll(/\bimport\s*\(\s*["']([^"']+\.js)["']\s*\)/g)
  ];

  return unique(
    imports
      .map((match) => match[1])
      .filter((value) => value.startsWith(".") || value.startsWith("/"))
      .map((value) => new URL(value, scriptUrl).toString())
      .filter((url) => isSameHttpOrigin(url, allowedOrigin))
  );
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_BUNDLE_REDIRECTS = 5;

function httpOrigin(url) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Bundle discovery requires an HTTP(S) base URL.");
  }
  return parsed.origin;
}

function isSameHttpOrigin(url, allowedOrigin) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === allowedOrigin;
  } catch {
    return false;
  }
}

async function fetchSameOrigin(url, allowedOrigin, fetchImpl) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_BUNDLE_REDIRECTS; redirectCount += 1) {
    if (!isSameHttpOrigin(currentUrl, allowedOrigin)) {
      throw new Error("Bundle discovery refused a cross-origin request.");
    }
    const response = await fetchImpl(currentUrl, { redirect: "manual" });
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, effectiveUrl: currentUrl };
    }
    const location = response.headers.get("location");
    if (!location) {
      return { response, effectiveUrl: currentUrl };
    }
    if (redirectCount === MAX_BUNDLE_REDIRECTS) {
      throw new Error("Bundle discovery exceeded the redirect limit.");
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error("Bundle discovery exceeded the redirect limit.");
}

export function extractBundleVersion(scriptText) {
  const bundleMatch = scriptText.match(/bundleVersion\s*:\s*([A-Za-z_$][\w$]*)/);
  if (!bundleMatch) {
    return null;
  }

  const variableName = escapeRegExp(bundleMatch[1]);
  const assignment = scriptText.match(
    new RegExp(
      `(?:var|let|const)\\s+${variableName}\\s*=\\s*["']([A-Za-z0-9_-]{6,})["']`
    )
  );

  return assignment?.[1] || null;
}

async function parseJsonResponse(response, label) {
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`${label} returned a non-JSON response.`);
  }

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }

  return json;
}

function unique(values) {
  return [...new Set(values)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
