import { LEGACY_HOST_REDIRECTS, REFRESH_COOKIE, SESSION_COOKIE, SESSION_TTL_MS, securityHeaders } from "./config.js";
import type { RequestWithMeta, ResponseLike } from "./types.js";

export function parseCookies(header = ""): Record<string, string> {
  return header
    .split(";")
    .map(entry => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const index = entry.indexOf("=");
      if (index === -1) return acc;
      const key = entry.slice(0, index).trim();
      const value = entry.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function redactSensitiveText(
  value: string | undefined,
  secrets: Array<string | undefined> = []
) {
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

export function writeJson(
  response: ResponseLike,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {}
) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...securityHeaders,
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

export function requestHostname(request: RequestWithMeta) {
  const forwardedHost = request.headers["x-forwarded-host"];
  const forwardedHostValue =
    typeof forwardedHost === "string" && forwardedHost.trim()
      ? forwardedHost.split(",")[0] ?? ""
      : "";
  const rawHost =
    forwardedHostValue
      ? forwardedHostValue.trim()
      : String(request.headers.host || "").trim();

  return rawHost.replace(/:\d+$/u, "").toLowerCase();
}

export function maybeRedirectLegacyHost(
  request: RequestWithMeta,
  response: ResponseLike,
  url: URL
) {
  const redirectOrigin = LEGACY_HOST_REDIRECTS.get(requestHostname(request));
  if (!redirectOrigin) return false;

  response.writeHead(308, {
    "Cache-Control": "public, max-age=3600",
    Location: `${redirectOrigin}${url.pathname}${url.search}`,
    ...securityHeaders,
  });
  response.end();
  return true;
}

export async function readJsonBody(request: RequestWithMeta): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export function isSecureRequest(request: RequestWithMeta) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedProtoValue =
    typeof forwardedProto === "string" && forwardedProto.trim()
      ? forwardedProto.split(",")[0] ?? ""
      : "";
  if (forwardedProtoValue) {
    return forwardedProtoValue.trim().toLowerCase() === "https";
  }

  return Boolean((request.socket as { encrypted?: boolean } | undefined)?.encrypted);
}

export function requestClientIp(request: RequestWithMeta) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedForValue =
    typeof forwardedFor === "string" && forwardedFor.trim()
      ? forwardedFor.split(",")[0] ?? ""
      : "";
  if (forwardedForValue) {
    return forwardedForValue.trim();
  }

  return request.socket?.remoteAddress || "unknown";
}

export function buildCookieAttributes(request: RequestWithMeta, maxAgeSeconds: number) {
  const secureAttribute = isSecureRequest(request) ? "; Secure" : "";
  return `HttpOnly; Path=/; SameSite=Lax${secureAttribute}; Max-Age=${maxAgeSeconds}`;
}

export function setAuthCookies(request: RequestWithMeta, response: ResponseLike, session: { id: string; refreshToken: string }) {
  const cookieAttributes = buildCookieAttributes(request, SESSION_TTL_MS / 1000);
  response.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=${encodeURIComponent(session.id)}; ${cookieAttributes}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(session.refreshToken)}; ${cookieAttributes}`,
  ]);
}

export function clearAuthCookies(request: RequestWithMeta, response: ResponseLike) {
  const cookieAttributes = buildCookieAttributes(request, 0);
  response.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=; ${cookieAttributes}`,
    `${REFRESH_COOKIE}=; ${cookieAttributes}`,
  ]);
}
