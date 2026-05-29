import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDirs = [path.join(__dirname, "dist"), path.join(__dirname, "public")];
const sourceDir = path.join(__dirname, "src");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8787);
const SESSION_COOKIE = "gira_planner_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

const GIRA_AUTH_URL = "https://c2g091p01.emel.pt/auth";
const GIRA_GRAPHQL_URL = "https://c2g091p01.emel.pt/ws/graphql";
const GIRA_PUBLIC_STATIONS_URL =
  "https://dados.emel.pt/dataset/57181518-0708-4fb5-a7d1-69875dee8478/resource/d1950d9d-26be-4ced-b1c4-9af65c8d2c70/download/girastations.json";
const USER_AGENT = "Gira/3.4.3 (Android 34)";
const PUBLIC_STATIONS_TTL_MS = 1000 * 60 * 60 * 12;

const sessions = new Map();
let publicStationsCache = {
  expiresAt: 0,
  stations: [],
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function parseCookies(header = "") {
  return header
    .split(";")
    .map(entry => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const index = entry.indexOf("=");
      if (index === -1) return acc;
      const key = entry.slice(0, index).trim();
      const value = entry.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function normalizeStationName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^\d+\s*-\s*/u, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function haversineKm(from, to) {
  const earthRadiusKm = 6371;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stripLeadingZeros(value) {
  const stripped = String(value ?? "").replace(/^0+(?=\d)/, "");
  return stripped || String(value ?? "");
}

function redactSensitiveText(value, secrets = []) {
  let text = typeof value === "string" ? value : "";
  if (!text) return "";

  text = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/giu, "Bearer [redacted-token]")
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|password|token)\b\s*[:=]\s*["']?[^"',\s}]+["']?/giu,
      "$1=[redacted]"
    );

  for (const secret of secrets) {
    const normalizedSecret = String(secret || "");
    if (normalizedSecret.length < 4) continue;
    text = text.split(normalizedSecret).join("[redacted]");
  }

  return text;
}

function writeJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function getSession(request) {
  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function createSession(tokens, user) {
  const id = randomUUID();
  const session = {
    id,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiration: tokens.expiration,
    user,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(id, session);
  return session;
}

function clearSession(sessionId) {
  if (sessionId) sessions.delete(sessionId);
}

function setSessionCookie(response, sessionId) {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${
      SESSION_TTL_MS / 1000
    }`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  );
}

async function upstreamJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

function sanitizeAuthFailure(status, context = "login") {
  const statusCode = status >= 400 ? status : 401;
  if (context === "refresh") {
    return {
      statusCode,
      message: "Your Gira session expired. Please sign in again.",
    };
  }

  if (statusCode === 429) {
    return {
      statusCode,
      message: "The Gira authentication service is temporarily rate limiting requests.",
    };
  }

  return {
    statusCode,
    message: "The Gira email or password was not accepted.",
  };
}

async function loginToGira(email, password) {
  const response = await upstreamJson(`${GIRA_AUTH_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Priority: "high",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      Provider: "EmailPassword",
      CredentialsEmailPassword: {
        email,
        password,
      },
    }),
  });

  if (!response.ok || !response.body?.data?.accessToken || !response.body?.data?.refreshToken) {
    throw sanitizeAuthFailure(response.status, "login");
  }

  return response.body.data;
}

async function refreshSession(session) {
  const response = await upstreamJson(`${GIRA_AUTH_URL}/token/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      token: session.refreshToken,
    }),
  });

  if (!response.ok || !response.body?.data?.accessToken || !response.body?.data?.refreshToken) {
    throw sanitizeAuthFailure(response.status, "refresh");
  }

  session.accessToken = response.body.data.accessToken;
  session.refreshToken = response.body.data.refreshToken;
  session.expiration = response.body.data.expiration;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

async function fetchUser(session) {
  const response = await upstreamJson(`${GIRA_AUTH_URL}/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok || !response.body?.data) {
    return session.user || null;
  }

  session.user = {
    email: response.body.data.email || "",
    name: response.body.data.name || response.body.data.email || "Gira user",
  };
  return session.user;
}

async function loadPublicStations() {
  if (publicStationsCache.expiresAt > Date.now() && publicStationsCache.stations.length > 0) {
    return publicStationsCache.stations;
  }

  const response = await upstreamJson(GIRA_PUBLIC_STATIONS_URL, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok || !Array.isArray(response.body)) {
    throw {
      statusCode: response.status || 502,
      message: "The EMEL public station catalog is unavailable.",
    };
  }

  publicStationsCache = {
    expiresAt: Date.now() + PUBLIC_STATIONS_TTL_MS,
    stations: response.body
      .map(station => ({
        latitude: Number(station.latitude),
        longitude: Number(station.longitude),
        normalizedName: normalizeStationName(station.estacaolocalizacao),
        shortCode: String(station.id_expl),
      }))
      .filter(
        station =>
          station.shortCode &&
          Number.isFinite(station.latitude) &&
          Number.isFinite(station.longitude)
      ),
  };

  return publicStationsCache.stations;
}

function matchPublicStation(liveStation, publicStations) {
  const normalizedLiveName = normalizeStationName(liveStation.name || liveStation.description || "");
  const exactNameMatches = publicStations.filter(
    station => station.normalizedName && station.normalizedName === normalizedLiveName
  );

  const chooseNearest = candidates =>
    candidates.reduce((best, candidate) => {
      const distanceKm = haversineKm(liveStation, candidate);
      if (!best || distanceKm < best.distanceKm) {
        return {
          distanceKm,
          station: candidate,
        };
      }
      return best;
    }, null);

  const exactMatch = chooseNearest(exactNameMatches);
  if (exactMatch) return exactMatch.station;

  const nearbyMatch = chooseNearest(
    publicStations.filter(station => haversineKm(liveStation, station) <= 0.08)
  );
  if (nearbyMatch) return nearbyMatch.station;

  return null;
}

async function fetchStations(session, retry = true) {
  const response = await upstreamJson(GIRA_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      operationName: "getStations",
      variables: {},
      query:
        "query getStations {getStations { code, description, latitude, longitude, name, bikes, docks, serialNumber, assetStatus }}",
    }),
  });

  if (response.status === 401 && retry) {
    await refreshSession(session);
    return fetchStations(session, false);
  }

  if (!response.ok || !response.body?.data?.getStations) {
    throw {
      code: response.status,
      message: "The Gira live station API did not return a usable snapshot.",
    };
  }

  const publicStations = await loadPublicStations().catch(() => []);

  return response.body.data.getStations
    .filter(station => station && station.code && station.serialNumber)
    .map(station => {
      const normalizedStation = {
        assetStatus: station.assetStatus || "unknown",
        bikes: Number(station.bikes ?? 0),
        code: String(station.code),
        description: station.description || null,
        docks: Number(station.docks ?? 0),
        latitude: Number(station.latitude),
        longitude: Number(station.longitude),
        name: station.name || station.description || `Station ${station.code}`,
        serialNumber: String(station.serialNumber),
      };

      const publicMatch = matchPublicStation(normalizedStation, publicStations);

      return {
        ...normalizedStation,
        displayCode: publicMatch?.shortCode || stripLeadingZeros(normalizedStation.code),
      };
    });
}

function sessionSummary(session) {
  return {
    authenticated: true,
    user: session.user || null,
  };
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

setInterval(cleanupSessions, 1000 * 60 * 15).unref();

async function serveStatic(request, response) {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const readStaticFile = async relativePath => {
    for (const staticDir of staticDirs) {
      const safePath =
        relativePath === "/"
          ? path.join(staticDir, "index.html")
          : path.resolve(staticDir, `.${relativePath}`);

      if (!safePath.startsWith(staticDir)) {
        continue;
      }

      try {
        const file = await readFile(safePath);
        return {
          file,
          safePath,
        };
      } catch {
        // try the next static root
      }
    }

    if (relativePath.startsWith("/src/")) {
      const safePath = path.resolve(__dirname, `.${relativePath}`);

      if (safePath.startsWith(`${sourceDir}${path.sep}`)) {
        try {
          const file = await readFile(safePath);
          return {
            file,
            safePath,
          };
        } catch {
          // fall through to the 404 below
        }
      }
    }

    return null;
  };

  const asset = await readStaticFile(requestPath);

  if (asset) {
    const ext = path.extname(asset.safePath);
    const cacheControl =
      ext === ".html" || ext === ".js" || ext === ".css" ? "no-store" : "public, max-age=3600";

    response.writeHead(200, {
      "Cache-Control": cacheControl,
      "Content-Type": contentTypes[ext] || "application/octet-stream",
    });
    response.end(asset.file);
    return;
  }

  if (requestPath !== "/" && !path.extname(requestPath)) {
    const spaEntry = await readStaticFile("/");
    if (spaEntry) {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(spaEntry.file);
      return;
    }
  }

  writeJson(response, 404, {
    error: "Not found.",
  });
}

function requestFingerprint(request) {
  return createHash("sha1")
    .update(`${request.socket.remoteAddress ?? "unknown"}|${request.headers["user-agent"] ?? "unknown"}`)
    .digest("hex")
    .slice(0, 10);
}

const server = createServer(async (request, response) => {
  const method = request.method || "GET";
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  try {
    if (url.pathname === "/api/session" && method === "GET") {
      const session = getSession(request);
      if (!session) {
        writeJson(response, 200, {
          authenticated: false,
        });
        return;
      }

      if (!session.user) await fetchUser(session);
      writeJson(response, 200, sessionSummary(session));
      return;
    }

    if (url.pathname === "/api/login" && method === "POST") {
      const body = await readJsonBody(request);
      const email = String(body.email || "").trim();
      const password = String(body.password || "");

      if (!email || !password) {
        writeJson(response, 400, {
          error: "Email and password are required.",
        });
        return;
      }

      const tokens = await loginToGira(email, password);
      const session = createSession(tokens, {
        email,
        name: email,
      });

      await fetchUser(session).catch(() => null);
      setSessionCookie(response, session.id);
      writeJson(response, 200, sessionSummary(session));
      return;
    }

    if (url.pathname === "/api/logout" && method === "POST") {
      const cookies = parseCookies(request.headers.cookie);
      clearSession(cookies[SESSION_COOKIE]);
      clearSessionCookie(response);
      writeJson(response, 200, {
        authenticated: false,
      });
      return;
    }

    if (url.pathname === "/api/stations" && method === "GET") {
      const session = getSession(request);
      if (!session) {
        writeJson(response, 401, {
          error: "You need to log in with your Gira account first.",
        });
        return;
      }

      const stations = await fetchStations(session);
      if (!session.user) await fetchUser(session).catch(() => null);

      writeJson(response, 200, {
        fetchedAt: new Date().toISOString(),
        source: "live",
        stationCount: stations.length,
        stations,
        user: session.user || null,
      });
      return;
    }

    if (url.pathname === "/api/health" && method === "GET") {
      writeJson(response, 200, {
        ok: true,
        sessions: sessions.size,
        fingerprint: requestFingerprint(request),
      });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    const statusCode =
      Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : Number.isInteger(error?.code) && error.code >= 400 && error.code <= 599
          ? error.code
          : 500;
    const message =
      redactSensitiveText(error?.message, [
        error?.accessToken,
        error?.refreshToken,
      ]) || "Unexpected server error.";
    writeJson(response, statusCode, {
      error: message,
    });
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Gira Grand Prix is running at http://${displayHost}:${PORT}`);
});
