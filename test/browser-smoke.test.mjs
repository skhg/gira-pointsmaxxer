import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { chromium } from "playwright-core";

import { startTestServer } from "./helpers/app-server.mjs";

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
    const page = await browser.newPage();
    await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ body: "", status: 200 }));
    await page.route("https://fonts.gstatic.com/**", route => route.abort());
    await page.route("https://tile.openstreetmap.org/**", route => route.abort());

    await page.goto(`${server.baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByRole("button", { name: "Use demo snapshot" }).click();
    await page.evaluate(() => {
      const finishInput = globalThis.document.getElementById("finishTimeInput");
      const next = new Date(Date.now() + 2 * 60 * 60 * 1000);
      next.setSeconds(0, 0);
      const remainder = next.getMinutes() % 5;
      if (remainder !== 0) {
        next.setMinutes(next.getMinutes() + (5 - remainder));
      }
      const hours = String(next.getHours()).padStart(2, "0");
      const minutes = String(next.getMinutes()).padStart(2, "0");
      finishInput.value = `${hours}:${minutes}`;
      finishInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
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
