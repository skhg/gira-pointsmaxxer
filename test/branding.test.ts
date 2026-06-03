import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(TEST_DIR, "..");

test("branding metadata and asset files are present", async () => {
  const html = await readFile(path.join(ROOT_DIR, "index.html"), "utf8");

  assert.match(html, /<title>Gira Pointsmaxxer<\/title>/u);
  assert.match(html, /name="description"/u);
  assert.match(html, /rel="canonical" href="https:\/\/gira-pointsmaxxer\.onrender\.com\/"/u);
  assert.match(html, /property="og:title" content="Gira Pointsmaxxer"/u);
  assert.match(html, /property="og:image" content="https:\/\/gira-pointsmaxxer\.onrender\.com\/og-image\.png"/u);
  assert.match(html, /name="twitter:card" content="summary_large_image"/u);
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg"/u);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\.\/apple-touch-icon\.png"/u);
  assert.match(html, /rel="manifest" href="\.\/site\.webmanifest"/u);

  const requiredAssets = [
    "logo-badge.svg",
    "favicon.svg",
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "icon-192.png",
    "icon-512.png",
    "apple-touch-icon.png",
    "og-image.png",
    "og-image-source.svg",
    "site.webmanifest",
  ];

  await Promise.all(
    requiredAssets.map(assetPath => access(path.join(ROOT_DIR, "public", assetPath)))
  );
});
