import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppError } from "./src/types.js";
import type { AppServerInstance, AppServerOptions, RequestWithMeta } from "./server/types.js";

import {
  DEFAULT_SOURCE_DIR,
  DEFAULT_STATIC_DIRS,
  HOST,
  PORT,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "./server/config.js";
import {
  clearAuthCookies,
  maybeRedirectLegacyHost,
  parseCookies,
  readJsonBody,
  redactSensitiveText,
  setAuthCookies,
  writeJson,
} from "./server/http.js";
import {
  createDefaultPublicStationsLoader,
  createDefaultStationFetcher,
  defaultFetchUser,
  defaultLoginToGira,
  defaultRefreshSession,
  sessionSummary,
} from "./server/gira.js";
import { createSessionStore } from "./server/session-store.js";
import { createStaticAssetServer } from "./server/static.js";

const __filename = fileURLToPath(import.meta.url);

export function createAppServer(options: AppServerOptions = {}): AppServerInstance {
  const {
    clearIntervalFn = globalThis.clearInterval,
    fetchUser = defaultFetchUser,
    host = HOST,
    loadPublicStations = createDefaultPublicStationsLoader(),
    loginToGira = defaultLoginToGira,
    now = () => Date.now(),
    port = PORT,
    refreshSession = defaultRefreshSession,
    setIntervalFn = globalThis.setInterval,
    sourceDirectory = DEFAULT_SOURCE_DIR,
    staticDirectories = DEFAULT_STATIC_DIRS,
  } = options;
  const fetchStations =
    options.fetchStations ||
    createDefaultStationFetcher({
      loadPublicStations,
      refreshSession,
    });
  const serveStatic = createStaticAssetServer({
    sourceDirectory,
    staticDirectories,
  });
  const sessionStore = createSessionStore({
    clearIntervalFn,
    now,
    refreshSession,
    setIntervalFn,
  });

  const handler = async (request: RequestWithMeta, response) => {
    const method = request.method || "GET";
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    try {
      if (maybeRedirectLegacyHost(request, response, url)) {
        return;
      }

      if (url.pathname === "/api/session" && method === "GET") {
        const session = await sessionStore.getSession(request);
        if (!session) {
          if (request.__clearAuthCookies) clearAuthCookies(request, response);
          writeJson(response, 200, {
            authenticated: false,
          });
          return;
        }

        if (!session.user) await fetchUser(session);
        setAuthCookies(request, response, session);
        writeJson(response, 200, sessionSummary(session));
        return;
      }

      if (url.pathname === "/api/login" && method === "POST") {
        const body = await readJsonBody(request);
        const email = String(body.email || "").trim();
        const password = String(body.password || "");

        if (!email || !password) {
          writeJson(response, 400, {
            code: "missing_credentials",
            error: "Email and password are required.",
          });
          return;
        }

        const ipAddress = sessionStore.assertLoginRateLimit(request);
        let successfulLogin = false;
        const tokens = await loginToGira(email, password)
          .then(result => {
            successfulLogin = true;
            return result;
          })
          .finally(() => {
            sessionStore.recordLoginAttempt(ipAddress, successfulLogin);
          });
        const session = sessionStore.createSession(tokens, {
          email,
          name: email,
        });

        await fetchUser(session).catch(() => null);
        setAuthCookies(request, response, session);
        writeJson(response, 200, sessionSummary(session));
        return;
      }

      if (url.pathname === "/api/logout" && method === "POST") {
        const cookies = parseCookies(request.headers.cookie);
        sessionStore.clearSession(cookies[SESSION_COOKIE]);
        clearAuthCookies(request, response);
        writeJson(response, 200, {
          authenticated: false,
        });
        return;
      }

      if (url.pathname === "/api/stations" && method === "GET") {
        const session = await sessionStore.getSession(request);
        if (!session) {
          if (request.__clearAuthCookies) clearAuthCookies(request, response);
          writeJson(response, 401, {
            code: "login_required",
            error: "You need to log in with your Gira account first.",
          });
          return;
        }

        const stations = await fetchStations(session);
        if (!session.user) await fetchUser(session).catch(() => null);
        session.expiresAt = now() + SESSION_TTL_MS;
        setAuthCookies(request, response, session);

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
        });
        return;
      }

      await serveStatic(request, response);
    } catch (error) {
      const typedError = error as AppError;
      const typedStatusCode = typedError?.statusCode;
      const typedCode = typedError?.code;
      let statusCode = 500;
      if (
        typeof typedStatusCode === "number" &&
        Number.isInteger(typedStatusCode) &&
        typedStatusCode >= 400 &&
        typedStatusCode <= 599
      ) {
        statusCode = typedStatusCode;
      } else if (
        typeof typedCode === "number" &&
        Number.isInteger(typedCode) &&
        typedCode >= 400 &&
        typedCode <= 599
      ) {
        statusCode = typedCode;
      }
      const message =
        redactSensitiveText(typedError?.message, [
          typedError?.accessToken,
          typedError?.refreshToken,
        ]) || "Unexpected server error.";
      writeJson(response, statusCode, {
        code: typeof typedError?.code === "string" ? typedError.code : "genericServer",
        error: message,
      });
    }
  };

  const server = createServer(handler);

  return {
    close() {
      sessionStore.close();
      return new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    handler,
    host,
    port,
    server,
    state: sessionStore.state,
  };
}

function isDirectRun() {
  return Boolean(process.argv[1] && path.resolve(process.argv[1]) === __filename);
}

if (isDirectRun()) {
  const app = createAppServer();
  app.server.listen(app.port, app.host, () => {
    const displayHost = app.host === "0.0.0.0" ? "localhost" : app.host;
    console.log(`Gira Pointsmaxxer is running at http://${displayHost}:${app.port}`);
  });
}
