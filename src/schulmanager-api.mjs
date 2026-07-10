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
    const student = status?.user?.associatedStudent;

    if (student?.id) {
      return student;
    }

    const studentId = process.env.SCHULMANAGER_STUDENT_ID;
    if (studentId) {
      return { id: Number(studentId) };
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
  const htmlResponse = await fetchImpl(`${root}/`);
  const html = await htmlResponse.text();
  const queue = unique(
    [...html.matchAll(/(?:src|href)=["']([^"']+\.js)["']/g)].map((match) =>
      new URL(match[1], root).toString()
    )
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

    const response = await fetchImpl(scriptUrl);
    if (!response.ok) {
      continue;
    }

    const text = await response.text();
    const version = extractBundleVersion(text);
    checked.push(scriptUrl);
    if (version) {
      return version;
    }

    for (const importedUrl of extractImportedScriptUrls(text, scriptUrl)) {
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
  const imports = [
    ...scriptText.matchAll(/\bfrom\s*["']([^"']+\.js)["']/g),
    ...scriptText.matchAll(/\bimport\s*\(\s*["']([^"']+\.js)["']\s*\)/g)
  ];

  return unique(
    imports
      .map((match) => match[1])
      .filter((value) => value.startsWith(".") || value.startsWith("/"))
      .map((value) => new URL(value, scriptUrl).toString())
  );
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
