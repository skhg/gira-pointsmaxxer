import type { CurrentLocationState, Plan, Station, UserSummary } from "../types.js";

export interface AppState {
  currentLocation: CurrentLocationState | null;
  currentRoute: string;
  fetchedAt: string | null;
  isResolvingCurrentLocation: boolean;
  language: string;
  plan: Plan | null;
  source: string | null;
  stationByCode: Map<string, Station>;
  stations: Station[];
  user: UserSummary | null;
}
