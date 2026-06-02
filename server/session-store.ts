import { randomUUID } from "node:crypto";
import type { UserSummary } from "../src/types.js";
import type { GiraSession, RequestWithMeta, SessionStoreOptions, SessionTokens } from "./types.js";

import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "./config.js";
import { parseCookies, requestClientIp } from "./http.js";

function pruneLoginAttemptBucket(bucket, now = Date.now()) {
  return bucket.filter(timestamp => now - timestamp < LOGIN_WINDOW_MS);
}

export function createSessionStore(options: SessionStoreOptions) {
  const {
    clearIntervalFn = globalThis.clearInterval,
    now = () => Date.now(),
    refreshSession,
    setIntervalFn = globalThis.setInterval,
    trustProxy = false,
  } = options;

  const sessions = new Map<string, GiraSession>();
  const loginAttempts = new Map<string, number[]>();

  function createSession(tokens: SessionTokens, user: UserSummary): GiraSession {
    const timestamp = now();
    const session = {
      accessToken: tokens.accessToken,
      createdAt: timestamp,
      expiration: tokens.expiration,
      expiresAt: timestamp + SESSION_TTL_MS,
      id: randomUUID(),
      refreshToken: tokens.refreshToken,
      user,
    };
    sessions.set(session.id, session);
    return session;
  }

  function clearSession(sessionId?: string) {
    if (sessionId) sessions.delete(sessionId);
  }

  function getActiveLoginAttempts(ipAddress: string, timestamp = now()) {
    const bucket = pruneLoginAttemptBucket(loginAttempts.get(ipAddress) || [], timestamp);
    if (bucket.length === 0) {
      loginAttempts.delete(ipAddress);
      return [];
    }

    loginAttempts.set(ipAddress, bucket);
    return bucket;
  }

  function assertLoginRateLimit(request: RequestWithMeta) {
    const ipAddress = requestClientIp(request, { trustProxy });
    const attempts = getActiveLoginAttempts(ipAddress);
    if (attempts.length >= LOGIN_MAX_ATTEMPTS) {
      throw {
        code: "login_attempts_rate_limited",
        message: "Too many sign-in attempts from this network. Please wait 10 minutes and try again.",
        statusCode: 429,
      };
    }

    return ipAddress;
  }

  function recordLoginAttempt(ipAddress: string, successful: boolean) {
    if (!ipAddress) return;
    if (successful) {
      loginAttempts.delete(ipAddress);
      return;
    }

    const attempts = getActiveLoginAttempts(ipAddress);
    attempts.push(now());
    loginAttempts.set(ipAddress, attempts);
  }

  async function recoverSessionFromRefreshCookie(request: RequestWithMeta) {
    const cookies = parseCookies(request.headers.cookie);
    const refreshToken = String(cookies[REFRESH_COOKIE] || "").trim();
    if (!refreshToken) return null;

    const recoveredSession = {
      accessToken: "",
      createdAt: now(),
      expiration: 0,
      expiresAt: now() + SESSION_TTL_MS,
      id: randomUUID(),
      needsCookieSync: true,
      refreshToken,
      user: null,
    };

    try {
      await refreshSession(recoveredSession);
      recoveredSession.expiresAt = now() + SESSION_TTL_MS;
      sessions.set(recoveredSession.id, recoveredSession);
      return recoveredSession;
    } catch {
      request.__clearAuthCookies = true;
      return null;
    }
  }

  function cleanupSessions() {
    const timestamp = now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= timestamp) sessions.delete(id);
    }
  }

  function cleanupLoginAttempts() {
    const timestamp = now();
    for (const [ipAddress, timestamps] of loginAttempts) {
      const activeTimestamps = pruneLoginAttemptBucket(timestamps, timestamp);
      if (activeTimestamps.length === 0) {
        loginAttempts.delete(ipAddress);
      } else {
        loginAttempts.set(ipAddress, activeTimestamps);
      }
    }
  }

  const cleanupTimer = setIntervalFn(() => {
    cleanupSessions();
    cleanupLoginAttempts();
  }, 1000 * 60 * 15);
  cleanupTimer?.unref?.();

  async function getSession(request: RequestWithMeta) {
    const cookies = parseCookies(request.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE];
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        if (session.expiresAt <= now()) {
          sessions.delete(sessionId);
        } else {
          session.expiresAt = now() + SESSION_TTL_MS;
          return session;
        }
      }
    }

    return recoverSessionFromRefreshCookie(request);
  }

  return {
    assertLoginRateLimit,
    clearSession,
    close() {
      clearIntervalFn(cleanupTimer);
    },
    createSession,
    getSession,
    recordLoginAttempt,
    state: {
      loginAttempts,
      sessions,
    },
  };
}
