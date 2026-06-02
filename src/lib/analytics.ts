import type { AnalyticsEventName, TrackedLanguage } from "../types.js";

export const TRACKED_LANGUAGES: TrackedLanguage[] = ["en", "pt-PT"];

export const ANALYTICS_EVENT_NAMES: AnalyticsEventName[] = [
  "app_open",
  "page_view",
  "language_selected",
  "sign_in_success",
  "stations_refreshed",
  "planner_run",
  "current_location_used",
  "google_maps_link_opened",
  "credits_viewed",
  "stats_viewed",
];

export function isTrackedLanguage(value: string): value is TrackedLanguage {
  return TRACKED_LANGUAGES.includes(value as TrackedLanguage);
}

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return ANALYTICS_EVENT_NAMES.includes(value as AnalyticsEventName);
}
