import type {
  AnalyticsStatsResponse,
  AppRoutePath,
  CurrentLocationState,
  Plan,
  Station,
  TrackedLanguage,
  UserSummary,
} from "../types.js";

export interface AppState {
  currentLocation: CurrentLocationState | null;
  currentRoute: AppRoutePath;
  fetchedAt: string | null;
  isResolvingCurrentLocation: boolean;
  language: TrackedLanguage;
  plan: Plan | null;
  stats: AnalyticsStatsResponse | null;
  source: string | null;
  stationByCode: Map<string, Station>;
  stations: Station[];
  user: UserSummary | null;
}
