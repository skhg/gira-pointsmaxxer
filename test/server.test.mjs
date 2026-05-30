import assert from "node:assert/strict";
import test from "node:test";

import {
  cookieHeaderFromSetCookies,
  getSetCookies,
  pickCookie,
} from "./helpers/app-server.mjs";
import { invokeHandler } from "./helpers/http-invoke.mjs";
import { createAppServer } from "../server.mjs";

const SESSION_COOKIE = "gira_planner_session";
const REFRESH_COOKIE = "gira_planner_refresh";

function createAuthStubs(options = {}) {
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

test("session can be rebuilt from the refresh-token cookie after a restart", async () => {
  const stubs = createAuthStubs();
  const firstServer = createAppServer(stubs);
  let refreshCookie = "";

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

  const recoveredServer = createAppServer(stubs);
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
