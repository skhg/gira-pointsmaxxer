import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { chromium } from "playwright-core";

import { startTestServer } from "./helpers/app-server.mjs";
import { buildStation } from "./helpers/stations.mjs";

const LANGUAGE_STORAGE_KEY = "gira-pointsmaxxer-language-v1";
const CHROME_EXECUTABLE_CANDIDATES = [
  process.env.CHROME_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function findChromeExecutable() {
  return CHROME_EXECUTABLE_CANDIDATES.find(candidate => fs.existsSync(candidate)) || null;
}

async function openSmokePage(browser) {
  const page = await browser.newPage();
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ body: "", status: 200 }));
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
  await page.route("https://tile.openstreetmap.org/**", route => route.abort());
  return page;
}

function setFinishTimeOnPage(page, minutesFromNow) {
  return page.evaluate(offsetMinutes => {
    const finishInput = globalThis.document.getElementById("finishTimeInput");
    const next = new Date(Date.now() + offsetMinutes * 60 * 1000);
    next.setSeconds(0, 0);
    const hours = String(next.getHours()).padStart(2, "0");
    const minutes = String(next.getMinutes()).padStart(2, "0");
    finishInput.value = `${hours}:${minutes}`;
    finishInput.dispatchEvent(new Event("input", { bubbles: true }));
  }, minutesFromNow);
}

test("browser smoke: demo snapshot can produce a route in the built app", async t => {
  const chromeExecutable = findChromeExecutable();
  if (!chromeExecutable) {
    t.skip("Google Chrome is not installed on this machine.");
    return;
  }

  const server = await startTestServer();
  let browser = null;

  try {
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
    const page = await openSmokePage(browser);

    await page.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => globalThis.document.title === "Gira Pointsmaxxer");
    await expectHeading(page, "Gira Pointsmaxxer");

    await page.getByRole("button", { name: "Use demo snapshot" }).click();
    await setFinishTimeOnPage(page, 120);
    await page.locator("#startInput").selectOption({ index: 2 });
    await page.locator("#endInput").selectOption({ index: 2 });
    await page.getByRole("button", { name: "Find best strategy" }).click();

    await page.waitForFunction(() => {
      const pointsValue = globalThis.document.getElementById("pointsValue");
      return Boolean(pointsValue && pointsValue.textContent && pointsValue.textContent !== "0");
    });

    const points = await page.locator("#pointsValue").textContent();
    const rides = await page.locator("#ridesValue").textContent();
    const routeCount = await page.locator("#routeList .route-item").count();

    assert.ok(Number(points) > 0);
    assert.ok(Number(rides) > 0);
    assert.ok(routeCount > 0);
  } finally {
    if (browser) await browser.close();
    await server.app.close();
  }
});

test("browser smoke: live sign-in loads stations and stays signed in after refresh", async t => {
  const chromeExecutable = findChromeExecutable();
  if (!chromeExecutable) {
    t.skip("Google Chrome is not installed on this machine.");
    return;
  }

  const liveStations = [
    buildStation({
      bikes: 15,
      code: "421",
      displayCode: "421",
      docks: 20,
      latitude: 38.73937,
      longitude: -9.14199,
      name: "421 - Alameda",
      serialNumber: "live-421",
    }),
    buildStation({
      bikes: 4,
      code: "431",
      displayCode: "431",
      docks: 18,
      latitude: 38.7399,
      longitude: -9.1425,
      name: "431 - Arco Cego",
      serialNumber: "live-431",
    }),
    buildStation({
      bikes: 2,
      code: "452",
      displayCode: "452",
      docks: 22,
      latitude: 38.747751,
      longitude: -9.136681,
      name: "452 - Gama Barros",
      serialNumber: "live-452",
    }),
  ];

  const server = await startTestServer({
    fetchStations: async () => liveStations,
    fetchUser: async session => {
      session.user = {
        email: "rider@example.com",
        name: "Test Rider",
      };
      return session.user;
    },
    loginToGira: async () => ({
      accessToken: "browser-access",
      expiration: Date.now() + 60 * 60 * 1000,
      refreshToken: "browser-refresh",
    }),
  });
  let browser = null;

  try {
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
    const page = await openSmokePage(browser);

    await page.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await page.locator("#emailInput").fill("rider@example.com");
    await page.locator("#passwordInput").fill("not-a-real-password");
    await page.locator("#loginButton").click();

    await page.waitForFunction(() => {
      const loginForm = globalThis.document.getElementById("loginForm");
      const stationCount = globalThis.document.getElementById("stationCount");
      return Boolean(loginForm?.hidden) && stationCount?.textContent === "3";
    });

    assert.equal(await page.locator("#sessionStatus").textContent(), "Test Rider");
    assert.equal(await page.locator("#passwordInput").inputValue(), "");
    assert.equal(await page.locator("#startInput").isDisabled(), false);

    await page.reload({
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => {
      const loginForm = globalThis.document.getElementById("loginForm");
      const sessionStatus = globalThis.document.getElementById("sessionStatus");
      return Boolean(loginForm?.hidden) && sessionStatus?.textContent === "Test Rider";
    });

    assert.equal(await page.locator("#loginForm").evaluate(node => node.hidden), true);
    assert.equal(await page.locator("#sessionStatus").textContent(), "Test Rider");
  } finally {
    if (browser) await browser.close();
    await server.app.close();
  }
});

test("browser smoke: disclaimer page is reachable from hero, footer, and direct URL", async t => {
  const chromeExecutable = findChromeExecutable();
  if (!chromeExecutable) {
    t.skip("Google Chrome is not installed on this machine.");
    return;
  }

  const server = await startTestServer();
  let browser = null;

  try {
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
    const page = await openSmokePage(browser);

    await page.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => globalThis.document.title === "Gira Pointsmaxxer");

    await page.getByRole("link", { name: "What is this?" }).click();
    await page.waitForFunction(() => globalThis.location.pathname === "/credits");
    assert.equal(new URL(page.url()).pathname, "/credits");
    await page.waitForFunction(
      () => globalThis.document.title === "Disclaimer & Credits · Gira Pointsmaxxer"
    );

    await page.getByRole("link", { name: "Back to planner" }).click();
    await page.waitForFunction(() => globalThis.location.pathname === "/");
    assert.equal(new URL(page.url()).pathname, "/");
    await page.waitForFunction(() => globalThis.document.title === "Gira Pointsmaxxer");

    await page.getByRole("link", { name: "Disclaimer & credits" }).click();
    await page.waitForFunction(() => globalThis.location.pathname === "/credits");

    assert.equal(new URL(page.url()).pathname, "/credits");
    const creditsText = await page.locator("#creditsPage").textContent();
    assert.match(creditsText || "", /not an official app of\s+EMEL or Gira/iu);
    assert.match(creditsText || "", /What is Gira\?/iu);
    assert.match(creditsText || "", /official Gira website/iu);
    assert.match(creditsText || "", /Semana da Bicicleta 2026/iu);
    assert.match(creditsText || "", /follow the rules of the road/iu);

    await page.getByRole("link", { name: "Back to planner" }).click();
    await page.waitForFunction(() => globalThis.location.pathname === "/");
    assert.equal(new URL(page.url()).pathname, "/");

    await page.goto(`${server.baseUrl}/credits`, {
      waitUntil: "domcontentloaded",
    });

    assert.equal(new URL(page.url()).pathname, "/credits");
    await page.waitForFunction(() => {
      const creditsPage = globalThis.document.getElementById("creditsPage");
      return Boolean(creditsPage && !creditsPage.hidden);
    });
    await page.waitForFunction(
      () => globalThis.document.title === "Disclaimer & Credits · Gira Pointsmaxxer"
    );

    const directLoadText = await page.locator("#creditsPage").textContent();
    assert.match(directLoadText || "", /Source repository link coming soon/iu);
    assert.match(directLoadText || "", /gira-mais/iu);
    assert.match(directLoadText || "", /mGira/iu);
    assert.match(directLoadText || "", /hosted for free on\s+Render/iu);
    assert.match(directLoadText || "", /hosted in the EU/iu);
  } finally {
    if (browser) await browser.close();
    await server.app.close();
  }
});

test("browser smoke: finish-time edge cases disable planning until enough time remains", async t => {
  const chromeExecutable = findChromeExecutable();
  if (!chromeExecutable) {
    t.skip("Google Chrome is not installed on this machine.");
    return;
  }

  const server = await startTestServer();
  let browser = null;

  try {
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
    const page = await openSmokePage(browser);

    await page.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByRole("button", { name: "Use demo snapshot" }).click();
    await page.waitForFunction(() => globalThis.document.getElementById("stationCount")?.textContent === "12");

    await setFinishTimeOnPage(page, -10);
    await page.waitForFunction(() => {
      const note = globalThis.document.getElementById("finishTimeNote");
      const button = globalThis.document.getElementById("planButton");
      return (
        button?.disabled === true &&
        note?.dataset.state === "error" &&
        /already passed today/i.test(note.textContent || "")
      );
    });

    await setFinishTimeOnPage(page, 3);
    await page.waitForFunction(() => {
      const note = globalThis.document.getElementById("finishTimeNote");
      const button = globalThis.document.getElementById("planButton");
      return (
        button?.disabled === true &&
        note?.dataset.state === "warning" &&
        /at least 5 minutes from now/i.test(note.textContent || "")
      );
    });

    await setFinishTimeOnPage(page, 45);
    await page.waitForFunction(() => {
      const note = globalThis.document.getElementById("finishTimeNote");
      const button = globalThis.document.getElementById("planButton");
      return button?.disabled === false && note?.dataset.state === "ok";
    });
  } finally {
    if (browser) await browser.close();
    await server.app.close();
  }
});

test("browser smoke: current-location shortcut resolves the nearest station and restores the prior choice on failure", async t => {
  const chromeExecutable = findChromeExecutable();
  if (!chromeExecutable) {
    t.skip("Google Chrome is not installed on this machine.");
    return;
  }

  const server = await startTestServer();
  let browser = null;

  try {
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
    const page = await openSmokePage(browser);
    await page.addInitScript(() => {
      Object.defineProperty(globalThis.navigator, "geolocation", {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByRole("button", { name: "Use demo snapshot" }).click();
    await page.waitForFunction(() => globalThis.document.getElementById("stationCount")?.textContent === "12");

    await page.evaluate(() => {
      globalThis.__GIRA_GRAND_PRIX_MOCK_LOCATION__ = {
        latitude: 38.7394,
        longitude: -9.142,
      };
    });
    await page.locator("#currentLocationButton").click();

    await page.waitForFunction(() => {
      const startInput = globalThis.document.getElementById("startInput");
      const option = startInput?.querySelector('option[value="__current_location__"]');
      return startInput?.value === "__current_location__" && /431/u.test(option?.textContent || "");
    });

    await page.locator("#startInput").selectOption("104");
    await page.evaluate(() => {
      delete globalThis.__GIRA_GRAND_PRIX_MOCK_LOCATION__;
    });
    await page.locator("#currentLocationButton").click();

    await page.waitForFunction(() => {
      const startInput = globalThis.document.getElementById("startInput");
      const toast = globalThis.document.getElementById("toast");
      return (
        startInput?.value === "104" &&
        toast?.dataset.type === "error" &&
        /does not expose GPS location/i.test(toast.textContent || "")
      );
    });
  } finally {
    if (browser) await browser.close();
    await server.app.close();
  }
});

test("browser smoke: language picker follows browser language and can persist Portuguese", async t => {
  const chromeExecutable = findChromeExecutable();
  if (!chromeExecutable) {
    t.skip("Google Chrome is not installed on this machine.");
    return;
  }

  const server = await startTestServer();
  let browser = null;

  try {
    browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });

    const englishPage = await openSmokePage(browser);
    await englishPage.addInitScript(() => {
      Object.defineProperty(globalThis.navigator, "language", {
        configurable: true,
        get: () => "en-GB",
      });
      Object.defineProperty(globalThis.navigator, "languages", {
        configurable: true,
        get: () => ["en-GB", "en"],
      });
    });
    await englishPage.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await englishPage.waitForFunction(() => globalThis.document.title === "Gira Pointsmaxxer");
    assert.equal(await englishPage.locator("#languageSelect").inputValue(), "en");

    const portugueseBrowserPage = await openSmokePage(browser);
    await portugueseBrowserPage.addInitScript(() => {
      Object.defineProperty(globalThis.navigator, "language", {
        configurable: true,
        get: () => "pt-PT",
      });
      Object.defineProperty(globalThis.navigator, "languages", {
        configurable: true,
        get: () => ["pt-PT", "pt", "en-GB"],
      });
    });
    await portugueseBrowserPage.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await portugueseBrowserPage.waitForFunction(
      () => globalThis.document.documentElement.lang === "pt-PT"
    );
    assert.equal(await portugueseBrowserPage.locator("#languageSelect").inputValue(), "pt-PT");
    assert.equal(
      await portugueseBrowserPage.locator("#authSectionTitle").textContent(),
      "Liga a tua conta"
    );
    assert.equal(
      await portugueseBrowserPage.locator("#plannerWhatIsThisLink").textContent(),
      "O que é isto?"
    );

    const portugueseStoredPage = await openSmokePage(browser);
    await portugueseStoredPage.addInitScript(storageKey => {
      globalThis.localStorage.setItem(storageKey, "pt-PT");
    }, LANGUAGE_STORAGE_KEY);
    await portugueseStoredPage.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await portugueseStoredPage.waitForFunction(
      () => globalThis.document.documentElement.lang === "pt-PT"
    );
    assert.equal(await portugueseStoredPage.locator("#languageSelect").inputValue(), "pt-PT");
  } finally {
    if (browser) await browser.close();
    await server.app.close();
  }
});

async function expectHeading(page, text) {
  await page.getByRole("heading", { level: 1, name: text }).waitFor();
}
