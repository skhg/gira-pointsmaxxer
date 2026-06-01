export type MessageValues = Record<string, string | number>;

export interface StationLike {
  assetStatus?: string;
  bikes?: number | string;
  code: string | number;
  description?: string | null;
  displayCode?: string;
  docks?: number | string;
  label?: string;
  latitude: number | string;
  longitude: number | string;
  name?: string;
  serialNumber?: string | number;
  shortCode?: string;
}

export interface Station {
  assetStatus: string;
  bikes: number;
  code: string;
  description?: string | null;
  displayCode?: string;
  docks: number;
  label?: string;
  latitude: number;
  longitude: number;
  name: string;
  serialNumber: string;
  shortCode?: string;
}

export interface UserSummary {
  email: string;
  name: string;
}

export interface SessionSummaryResponse {
  authenticated: boolean;
  user: UserSummary | null;
}

export interface LiveSnapshotResponse extends SessionSummaryResponse {
  fetchedAt: string;
  source: string;
  stationCount: number;
  stations: Station[];
}

export interface SavedCredentials {
  email: string;
}

export interface LocationSnapshot {
  accuracy: number;
  capturedAt: number;
  latitude: number;
  longitude: number;
}

export interface CurrentLocationState extends LocationSnapshot {
  nearestStationCode: string;
  nearestStationLabel: string;
}

export interface WalkStep {
  distanceKm: number;
  from: StationLike;
  points: number;
  sequence: number;
  slots: number;
  title: string;
  to: StationLike;
  travelMinutes: number;
  type: "walk";
}

export interface RideStep {
  distanceKm: number;
  finishBonus: number;
  from: Station;
  points: number;
  sequence: number;
  startBonus: number;
  title: string;
  to: Station;
  travelMinutes: number;
  type: "ride";
}

export type PlanStep = WalkStep | RideStep;

export interface Plan {
  bikePickupStation: Station;
  challengeFinishTime: Date;
  challengeRemainingMinutes: number;
  endIndex: number;
  endStation: Station;
  finishAt: number;
  plannedAt: Date;
  points: number;
  remainingBufferMinutes: number;
  rides: number;
  route: RideStep[];
  startOrigin: StationLike | null;
  startStation: Station;
  steps: PlanStep[];
  totalDistanceKm: number;
  totalFinishBonus: number;
  totalRideMinutes: number;
  totalStartBonus: number;
  totalTravelMinutes: number;
  totalWalkDistanceKm: number;
  totalWalkMinutes: number;
  walkSteps: WalkStep[];
}

export interface AppError extends Error {
  accessToken?: string;
  code?: number | string;
  details?: unknown;
  refreshToken?: string;
  status?: number;
  statusCode?: number;
  translationKey?: string;
  translationValues?: MessageValues;
}

export interface CreditsLinkPart {
  label: string;
  type: "link";
  url: string;
}

export type CreditsRichTextPart = CreditsLinkPart | string;

export interface CreditsSection {
  list?: string[];
  note?: string;
  paragraphs?: string[];
  placeholder?: string;
  richParagraphs?: CreditsRichTextPart[][];
  title: string;
}
