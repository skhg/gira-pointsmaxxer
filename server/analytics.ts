import { createHmac } from "node:crypto";

import { isAnalyticsEventName, isTrackedLanguage, TRACKED_LANGUAGES } from "../src/lib/analytics.js";
import { isAppRoutePath } from "../src/lib/app-routes.js";
import type {
  AnalyticsEventRequest,
  AnalyticsLanguageStats,
  AnalyticsStatsResponse,
  AppError,
  TrackedLanguage,
} from "../src/types.js";
import type { GiraSession } from "./types.js";

const ANALYTICS_EVENT_REQUEST_KEYS = ["eventName", "language", "route"];

export function createAnalyticsError(message: string, code: string, statusCode = 400): AppError {
  return Object.assign(new Error(message), {
    code,
    statusCode,
  });
}

function createLanguageBucket(): AnalyticsLanguageStats {
  return {
    anonymousEventCount: 0,
    eventCount: 0,
    signedInUniqueUsers: 0,
  };
}

export function createEmptyAnalyticsStats(
  options: Partial<Pick<AnalyticsStatsResponse, "enabled">> = {}
): AnalyticsStatsResponse {
  const { enabled = false } = options;
  return {
    anonymous: {
      eventsLast30Days: 0,
      eventsLast7Days: 0,
      pageViewsLast30Days: 0,
      pageViewsLast7Days: 0,
    },
    enabled,
    generatedAt: new Date().toISOString(),
    languagesLast30Days: Object.fromEntries(
      TRACKED_LANGUAGES.map(language => [language, createLanguageBucket()])
    ) as Record<TrackedLanguage, AnalyticsLanguageStats>,
    signedInUniqueUsers: {
      last30Days: 0,
      last7Days: 0,
      lifetime: 0,
    },
    topEventsLast30Days: [],
    totals: {
      eventsLast30Days: 0,
      eventsLast7Days: 0,
    },
  };
}

export function parseAnalyticsEventRequest(payload: unknown): AnalyticsEventRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createAnalyticsError("Analytics event payload must be an object.", "invalid_analytics_event");
  }

  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  for (const key of keys) {
    if (!ANALYTICS_EVENT_REQUEST_KEYS.includes(key)) {
      throw createAnalyticsError(
        `Unexpected analytics field: ${key}.`,
        "invalid_analytics_event_field"
      );
    }
  }

  const eventName = String(record.eventName || "").trim();
  if (!isAnalyticsEventName(eventName)) {
    throw createAnalyticsError("Unknown analytics event.", "unknown_analytics_event");
  }

  const language = String(record.language || "").trim();
  if (!isTrackedLanguage(language)) {
    throw createAnalyticsError("Unknown analytics language.", "unknown_analytics_language");
  }

  const routeValue = record.route == null ? "" : String(record.route).trim();
  if (routeValue && !isAppRoutePath(routeValue)) {
    throw createAnalyticsError("Unknown analytics route.", "unknown_analytics_route");
  }

  return {
    eventName,
    language,
    route: routeValue && isAppRoutePath(routeValue) ? routeValue : undefined,
  };
}

export function resolveAnalyticsAccountKey(session: GiraSession | null | undefined) {
  if (!session) return null;
  return (
    String(
      session.analyticsAccountKey ||
        session.user?.email ||
        ""
    ).trim() || null
  );
}

export function hashAnalyticsAccountKey(accountKey: string | null, hashSalt: string) {
  const normalizedKey = String(accountKey || "").trim();
  if (!normalizedKey || !hashSalt) return null;

  return createHmac("sha256", hashSalt).update(normalizedKey).digest("hex");
}
