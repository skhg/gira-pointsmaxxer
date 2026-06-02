import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
export const ROOT_DIR = path.dirname(path.dirname(__filename));

export const DEFAULT_STATIC_DIRS = [
  path.join(ROOT_DIR, "dist"),
  path.join(ROOT_DIR, "public"),
];
export const DEFAULT_SOURCE_DIR = path.join(ROOT_DIR, "src");

export const HOST = process.env.HOST || "0.0.0.0";
export const PORT = Number(process.env.PORT || 8787);
export const TRUST_PROXY = process.env.TRUST_PROXY === "true";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const ANALYTICS_DATABASE_URL =
  process.env.ANALYTICS_DATABASE_URL || process.env.DATABASE_URL || "";
export const ANALYTICS_HASH_SALT =
  process.env.ANALYTICS_HASH_SALT ||
  (NODE_ENV === "production" ? "" : "development-only-analytics-salt");
export const ANALYTICS_RETENTION_DAYS = 365;
export const ANALYTICS_STATS_CACHE_MS = 1000 * 60 * 5;
export const ANALYTICS_TOP_EVENTS_LIMIT = 5;

export const SESSION_COOKIE = "gira_planner_session";
export const REFRESH_COOKIE = "gira_planner_refresh";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24;
export const LOGIN_WINDOW_MS = 1000 * 60 * 10;
export const LOGIN_MAX_ATTEMPTS = 8;
export const MAX_JSON_BODY_BYTES = 8 * 1024;
export const LEGACY_HOST_REDIRECTS = new Map([
  ["gira-grand-prix.onrender.com", "https://gira-pointsmaxxer.onrender.com"],
]);

export const GIRA_AUTH_URL = "https://c2g091p01.emel.pt/auth";
export const GIRA_GRAPHQL_URL = "https://c2g091p01.emel.pt/ws/graphql";
export const GIRA_PUBLIC_STATIONS_URL =
  "https://dados.emel.pt/dataset/57181518-0708-4fb5-a7d1-69875dee8478/resource/d1950d9d-26be-4ced-b1c4-9af65c8d2c70/download/girastations.json";
export const USER_AGENT = "Gira/3.4.3 (Android 34)";
export const PUBLIC_STATIONS_TTL_MS = 1000 * 60 * 60 * 12;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' https://fonts.gstatic.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https://tile.openstreetmap.org",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "upgrade-insecure-requests",
].join("; ");

export const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

export const securityHeaders = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Permissions-Policy": "geolocation=(self)",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
