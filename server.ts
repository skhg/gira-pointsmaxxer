import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppError } from "./src/types.js";
import type { AppServerInstance, AppServerOptions, RequestWithMeta } from "./server/types.js";

import {
  ANALYTICS_DATABASE_URL,
  ANALYTICS_HASH_SALT,
  ANALYTICS_RETENTION_DAYS,
  ANALYTICS_STATS_CACHE_MS,
  ANALYTICS_TOP_EVENTS_LIMIT,
  DEFAULT_SOURCE_DIR,
  DEFAULT_STATIC_DIRS,
  HOST,
  MAX_JSON_BODY_BYTES,
  NODE_ENV,
  PORT,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  TRUST_PROXY,
} from "./server/config.js";
import {
  createEmptyAnalyticsStats,
  hashAnalyticsAccountKey,
  parseAnalyticsEventRequest,
  resolveAnalyticsAccountKey,
} from "./server/analytics.js";
import {
  createDisabledAnalyticsStore,
  createInMemoryAnalyticsStore,
  createPostgresAnalyticsStore,
} from "./server/analytics-store.js";
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
    analyticsStore = ANALYTICS_DATABASE_URL && ANALYTICS_HASH_SALT
      ? createPostgresAnalyticsStore(ANALYTICS_DATABASE_URL, {
          retentionDays: ANALYTICS_RETENTION_DAYS,
          statsCacheMs: ANALYTICS_STATS_CACHE_MS,
          topEventsLimit: ANALYTICS_TOP_EVENTS_LIMIT,
        })
      : NODE_ENV === "production"
        ? createDisabledAnalyticsStore()
        : createInMemoryAnalyticsStore({
            retentionDays: ANALYTICS_RETENTION_DAYS,
            statsCacheMs: ANALYTICS_STATS_CACHE_MS,
            topEventsLimit: ANALYTICS_TOP_EVENTS_LIMIT,
          }),
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
    trustProxy = TRUST_PROXY,
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
    trustProxy,
  });

  const handler = async (request: RequestWithMeta, response) => {
    const method = request.method || "GET";
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    try {
      if (maybeRedirectLegacyHost(request, response, url, { trustProxy })) {
        return;
      }

      if (url.pathname === "/api/session" && method === "GET") {
        const session = await sessionStore.getSession(request);
        if (!session) {
          if (request.__clearAuthCookies) clearAuthCookies(request, response, { trustProxy });
          writeJson(response, 200, {
            authenticated: false,
          });
          return;
        }

        if (!session.user) await fetchUser(session);
        setAuthCookies(request, response, session, { trustProxy });
        writeJson(response, 200, sessionSummary(session));
        return;
      }

      if (url.pathname === "/api/login" && method === "POST") {
        const body = await readJsonBody(request, {
          maxBytes: MAX_JSON_BODY_BYTES,
        });
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
        setAuthCookies(request, response, session, { trustProxy });
        writeJson(response, 200, sessionSummary(session));
        return;
      }

      if (url.pathname === "/api/logout" && method === "POST") {
        const cookies = parseCookies(request.headers.cookie);
        sessionStore.clearSession(cookies[SESSION_COOKIE]);
        clearAuthCookies(request, response, { trustProxy });
        writeJson(response, 200, {
          authenticated: false,
        });
        return;
      }

      if (url.pathname === "/api/analytics/events" && method === "POST") {
        const body = await readJsonBody(request, {
          maxBytes: Math.min(MAX_JSON_BODY_BYTES, 2 * 1024),
        });
        const event = parseAnalyticsEventRequest(body);
        const session = await sessionStore.getSession(request);
        if (request.__clearAuthCookies) {
          clearAuthCookies(request, response, { trustProxy });
        }

        await analyticsStore.recordEvent({
          accountHash: hashAnalyticsAccountKey(
            resolveAnalyticsAccountKey(session),
            ANALYTICS_HASH_SALT
          ),
          authenticated: Boolean(session?.user),
          eventName: event.eventName,
          language: event.language,
          occurredAt: new Date(),
          route: event.route || null,
        });

        writeJson(response, 202, {
          ok: true,
          tracked: analyticsStore.mode !== "disabled",
        });
        return;
      }

      if (url.pathname === "/api/analytics/stats" && method === "GET") {
        const stats =
          analyticsStore.mode === "disabled"
            ? createEmptyAnalyticsStats()
            : await analyticsStore.getPublicStats(new Date());
        writeJson(response, 200, stats);
        return;
      }

      if (url.pathname === "/api/stations" && method === "GET") {
        const session = await sessionStore.getSession(request);
        if (!session) {
          if (request.__clearAuthCookies) clearAuthCookies(request, response, { trustProxy });
          writeJson(response, 401, {
            code: "login_required",
            error: "You need to log in with your Gira account first.",
          });
          return;
        }

        const stations = await fetchStations(session);
        if (!session.user) await fetchUser(session).catch(() => null);
        session.expiresAt = now() + SESSION_TTL_MS;
        setAuthCookies(request, response, session, { trustProxy });

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
      return Promise.resolve(analyticsStore.close?.()).then(
        () =>
          new Promise<void>((resolve, reject) => {
            server.close(error => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          })
      );
    },
    handler,
    host,
    port,
    server,
    state: {
      ...sessionStore.state,
      analytics: {
        mode: analyticsStore.mode,
      },
    },
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
