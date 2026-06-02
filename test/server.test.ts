import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cookieHeaderFromSetCookies,
  getSetCookies,
  pickCookie,
} from "./helpers/app-server.js";
import { invokeHandler } from "./helpers/http-invoke.js";
import { createAppServer } from "../server.js";
import { MAX_JSON_BODY_BYTES } from "../server/config.js";
import type { Station } from "../src/types.js";

const SESSION_COOKIE = "gira_planner_session";
const REFRESH_COOKIE = "gira_planner_refresh";

function createAuthStubs(options: { stations?: Station[] } = {}) {
  const calls = {
    login: 0,
    refresh: 0,
  };

  return {
    calls,
    fetchStations: async () => options.stations || [],
    fetchUser: async session => {
      session.user = {
        email: "rider@example.com",
        name: "Test Rider",
      };
      return session.user;
    },
    loginToGira: async () => {
      calls.login += 1;
      return {
        accessToken: "access-initial",
        expiration: 111,
        refreshToken: "refresh-initial",
      };
    },
    refreshSession: async session => {
      calls.refresh += 1;
      session.accessToken = `access-refreshed-${calls.refresh}`;
      session.refreshToken = `refresh-rotated-${calls.refresh}`;
      session.expiration = 222;
      return session;
    },
  };
}

async function createTemporaryStaticFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gira-pointsmaxxer-static-"));
  const distDir = path.join(root, "dist");
  const sourceDir = path.join(root, "src");

  await mkdir(distDir, { recursive: true });
  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(distDir, "index.html"), "<!doctype html><title>fixture</title>");
  await writeFile(path.join(sourceDir, "app.css"), "body { color: tomato; }\n");

  return {
    cleanup: () => rm(root, { force: true, recursive: true }),
    distDir,
    sourceDir,
  };
}

test("session can be rebuilt from the refresh-token cookie after a restart", async () => {
  const stubs = createAuthStubs();
  const firstServer = createAppServer({
    ...stubs,
    trustProxy: true,
  });
  let refreshCookie;

  try {
    const loginResponse = await invokeHandler(firstServer.handler, {
      body: {
        email: "rider@example.com",
        password: "not-a-real-password",
      },
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Proto": "https",
      },
      method: "POST",
      url: "/api/login",
    });

    assert.equal(loginResponse.status, 200);
    const loginCookies = getSetCookies(loginResponse);
    assert.ok(loginCookies.some(cookie => cookie.startsWith(`${SESSION_COOKIE}=`)));
    assert.ok(loginCookies.some(cookie => cookie.startsWith(`${REFRESH_COOKIE}=`)));
    assert.ok(loginCookies.every(cookie => cookie.includes("HttpOnly")));
    assert.ok(loginCookies.every(cookie => cookie.includes("Secure")));
    refreshCookie = pickCookie(loginCookies, REFRESH_COOKIE);
  } finally {
    await firstServer.close().catch(() => null);
  }

  const recoveredServer = createAppServer({
    ...stubs,
    trustProxy: true,
  });
  try {
    const sessionResponse = await invokeHandler(recoveredServer.handler, {
      headers: {
        Cookie: refreshCookie,
        "X-Forwarded-Proto": "https",
      },
      url: "/api/session",
    });

    assert.equal(sessionResponse.status, 200);
    assert.deepEqual(await sessionResponse.json(), {
      authenticated: true,
      user: {
        email: "rider@example.com",
        name: "Test Rider",
      },
    });
    assert.equal(stubs.calls.refresh, 1);

    const recoveredCookies = getSetCookies(sessionResponse);
    assert.ok(recoveredCookies.some(cookie => cookie.startsWith(`${SESSION_COOKIE}=`)));
    assert.ok(recoveredCookies.some(cookie => cookie.startsWith(`${REFRESH_COOKIE}=refresh-rotated-1`)));
  } finally {
    await recoveredServer.close().catch(() => null);
  }
});

test("logout clears both auth cookies", async () => {
  const server = createAppServer(createAuthStubs());

  try {
    const loginResponse = await invokeHandler(server.handler, {
      body: {
        email: "rider@example.com",
        password: "not-a-real-password",
      },
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      url: "/api/login",
    });
    const loginCookies = getSetCookies(loginResponse);
    const logoutResponse = await invokeHandler(server.handler, {
      headers: {
        Cookie: cookieHeaderFromSetCookies(loginCookies),
      },
      method: "POST",
      url: "/api/logout",
    });

    assert.equal(logoutResponse.status, 200);
    const logoutCookies = getSetCookies(logoutResponse);
    assert.ok(logoutCookies.some(cookie => cookie.startsWith(`${SESSION_COOKIE}=`) && cookie.includes("Max-Age=0")));
    assert.ok(logoutCookies.some(cookie => cookie.startsWith(`${REFRESH_COOKIE}=`) && cookie.includes("Max-Age=0")));
  } finally {
    await server.close().catch(() => null);
  }
});

test("login endpoint rate limits repeated failures from the same client", async () => {
  let attempts = 0;
  const server = createAppServer({
    loginToGira: async () => {
      attempts += 1;
      throw {
        message: "The Gira email or password was not accepted.",
        statusCode: 401,
      };
    },
  });

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await invokeHandler(server.handler, {
        body: {
          email: "rider@example.com",
          password: "wrong-password",
        },
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        url: "/api/login",
      });

      assert.equal(response.status, 401);
    }

    const blockedResponse = await invokeHandler(server.handler, {
      body: {
        email: "rider@example.com",
        password: "wrong-password",
      },
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      url: "/api/login",
    });

    assert.equal(blockedResponse.status, 429);
    assert.match(await blockedResponse.text(), /Too many sign-in attempts/u);
    assert.equal(attempts, 8);
  } finally {
    await server.close().catch(() => null);
  }
});

test("legacy Render hostname permanently redirects to the new Pointsmaxxer URL", async () => {
  const server = createAppServer(createAuthStubs());

  try {
    const response = await invokeHandler(server.handler, {
      host: "gira-grand-prix.onrender.com",
      url: "/credits?view=full",
    });

    assert.equal(response.status, 308);
    assert.equal(
      response.headers.get("location"),
      "https://gira-pointsmaxxer.onrender.com/credits?view=full"
    );
  } finally {
    await server.close().catch(() => null);
  }
});

test("stations endpoint clears auth cookies after an invalid refresh cookie", async () => {
  const server = createAppServer({
    refreshSession: async () => {
      throw {
        code: "session_expired",
        message: "Your Gira session expired. Please sign in again.",
        statusCode: 401,
      };
    },
    trustProxy: true,
  });

  try {
    const response = await invokeHandler(server.handler, {
      headers: {
        Cookie: `${REFRESH_COOKIE}=stale-refresh-token`,
        "X-Forwarded-Proto": "https",
      },
      url: "/api/stations",
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "login_required",
      error: "You need to log in with your Gira account first.",
    });

    const clearedCookies = getSetCookies(response);
    assert.ok(
      clearedCookies.some(
        cookie => cookie.startsWith(`${SESSION_COOKIE}=`) && cookie.includes("Max-Age=0")
      )
    );
    assert.ok(
      clearedCookies.some(
        cookie => cookie.startsWith(`${REFRESH_COOKIE}=`) && cookie.includes("Max-Age=0")
      )
    );
  } finally {
    await server.close().catch(() => null);
  }
});

test("login rejects malformed JSON with a 400 response", async () => {
  const server = createAppServer(createAuthStubs());

  try {
    const response = await invokeHandler(server.handler, {
      body: '{"email":"rider@example.com"',
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      url: "/api/login",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "invalid_json",
      error: "Invalid JSON body.",
    });
  } finally {
    await server.close().catch(() => null);
  }
});

test("login rejects oversized JSON bodies with a 413 response", async () => {
  const server = createAppServer(createAuthStubs());

  try {
    const response = await invokeHandler(server.handler, {
      body: JSON.stringify({
        email: "rider@example.com",
        password: "x".repeat(MAX_JSON_BODY_BYTES),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      url: "/api/login",
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      code: "payload_too_large",
      error: "Request body is too large.",
    });
  } finally {
    await server.close().catch(() => null);
  }
});

test("login rate limiting ignores spoofed forwarded IPs unless proxy trust is enabled", async () => {
  let attempts = 0;
  const server = createAppServer({
    loginToGira: async () => {
      attempts += 1;
      throw {
        message: "The Gira email or password was not accepted.",
        statusCode: 401,
      };
    },
  });

  try {
    for (let index = 0; index < 8; index += 1) {
      const response = await invokeHandler(server.handler, {
        body: {
          email: "rider@example.com",
          password: "wrong-password",
        },
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `203.0.113.${index + 10}`,
        },
        method: "POST",
        remoteAddress: "198.51.100.20",
        url: "/api/login",
      });

      assert.equal(response.status, 401);
    }

    const blockedResponse = await invokeHandler(server.handler, {
      body: {
        email: "rider@example.com",
        password: "wrong-password",
      },
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.200",
      },
      method: "POST",
      remoteAddress: "198.51.100.20",
      url: "/api/login",
    });

    assert.equal(blockedResponse.status, 429);
    assert.equal(attempts, 8);
  } finally {
    await server.close().catch(() => null);
  }
});

test("static server falls back to the SPA entry for app routes", async () => {
  const fixture = await createTemporaryStaticFixture();
  const server = createAppServer({
    sourceDirectory: fixture.sourceDir,
    staticDirectories: [fixture.distDir],
  });

  try {
    const response = await invokeHandler(server.handler, {
      url: "/credits",
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(await response.text(), /<title>fixture<\/title>/u);
  } finally {
    await server.close().catch(() => null);
    await fixture.cleanup().catch(() => null);
  }
});

test("static server can still serve legacy /src assets when an old HTML shell is cached", async () => {
  const fixture = await createTemporaryStaticFixture();
  const server = createAppServer({
    sourceDirectory: fixture.sourceDir,
    staticDirectories: [fixture.distDir],
  });

  try {
    const response = await invokeHandler(server.handler, {
      url: "/src/app.css",
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/css; charset=utf-8");
    assert.match(await response.text(), /color: tomato/u);
  } finally {
    await server.close().catch(() => null);
    await fixture.cleanup().catch(() => null);
  }
});

test("analytics endpoints aggregate public stats without exposing raw account identifiers", async () => {
  const server = createAppServer(createAuthStubs());

  try {
    const anonymousResponse = await invokeHandler(server.handler, {
      body: {
        eventName: "page_view",
        language: "en",
        route: "/",
      },
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      url: "/api/analytics/events",
    });
    assert.equal(anonymousResponse.status, 202);

    const loginResponse = await invokeHandler(server.handler, {
      body: {
        email: "rider@example.com",
        password: "not-a-real-password",
      },
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      url: "/api/login",
    });
    const authCookie = cookieHeaderFromSetCookies(getSetCookies(loginResponse));

    for (const eventName of ["planner_run", "stats_viewed"] as const) {
      const trackedResponse = await invokeHandler(server.handler, {
        body: {
          eventName,
          language: "pt-PT",
          route: eventName === "stats_viewed" ? "/stats" : "/",
        },
        headers: {
          "Content-Type": "application/json",
          Cookie: authCookie,
        },
        method: "POST",
        url: "/api/analytics/events",
      });
      assert.equal(trackedResponse.status, 202);
    }

    const statsResponse = await invokeHandler(server.handler, {
      url: "/api/analytics/stats",
    });

    assert.equal(statsResponse.status, 200);
    const stats = await statsResponse.json();
    assert.equal(stats.enabled, true);
    assert.deepEqual(stats.signedInUniqueUsers, {
      last30Days: 1,
      last7Days: 1,
      lifetime: 1,
    });
    assert.deepEqual(stats.anonymous, {
      eventsLast30Days: 1,
      eventsLast7Days: 1,
      pageViewsLast30Days: 1,
      pageViewsLast7Days: 1,
    });
    assert.deepEqual(stats.totals, {
      eventsLast30Days: 3,
      eventsLast7Days: 3,
    });
    assert.deepEqual(stats.languagesLast30Days, {
      en: {
        anonymousEventCount: 1,
        eventCount: 1,
        signedInUniqueUsers: 0,
      },
      "pt-PT": {
        anonymousEventCount: 0,
        eventCount: 2,
        signedInUniqueUsers: 1,
      },
    });
    assert.deepEqual(stats.topEventsLast30Days, [
      {
        anonymousCount: 0,
        eventName: "planner_run",
        signedInCount: 1,
        totalCount: 1,
      },
      {
        anonymousCount: 0,
        eventName: "stats_viewed",
        signedInCount: 1,
        totalCount: 1,
      },
    ]);

    const serializedStats = JSON.stringify(stats);
    assert.doesNotMatch(serializedStats, /rider@example\.com/u);
    assert.doesNotMatch(serializedStats, /refresh-initial/u);
  } finally {
    await server.close().catch(() => null);
  }
});

test("analytics events reject unexpected fields", async () => {
  const server = createAppServer(createAuthStubs());

  try {
    const response = await invokeHandler(server.handler, {
      body: {
        eventName: "page_view",
        identity: "forbidden",
        language: "en",
        route: "/",
      },
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      url: "/api/analytics/events",
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /invalid_analytics_event_field/u);
  } finally {
    await server.close().catch(() => null);
  }
});
