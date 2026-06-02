import type { AnalyticsEventRequest, AnalyticsStatsResponse, AppError } from "./types.js";

function createError(message: unknown, status: number, code: string) {
  const error = new Error(String(message || "")) as AppError;
  error.code = code || "genericRequest";
  error.status = status;
  return error;
}

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw createError(data.error, response.status, String(data.code || "genericServer"));
  }

  return data as TResponse;
}

export async function fetchAnalyticsStats() {
  let response: Response;
  try {
    response = await fetch("/api/analytics/stats", {
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw createError((error as Error | undefined)?.message, 0, "genericRequest");
  }

  return parseJsonResponse<AnalyticsStatsResponse>(response);
}

export async function sendAnalyticsEvent(event: AnalyticsEventRequest) {
  const body = JSON.stringify(event);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const queued = navigator.sendBeacon(
        "/api/analytics/events",
        new Blob([body], {
          type: "application/json",
        })
      );
      if (queued) return;
    } catch {
      // Fall back to fetch below.
    }
  }

  try {
    await fetch("/api/analytics/events", {
      body,
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      method: "POST",
    });
  } catch {
    // Product analytics should never block the UI.
  }
}
