import type { IncomingMessage, Server, ServerResponse } from "node:http";

import type {
  AnalyticsEventName,
  AnalyticsStatsResponse,
  AppRoutePath,
  Station,
  TrackedLanguage,
  UserSummary,
} from "../src/types.js";

export interface SessionTokens {
  accessToken: string;
  expiration: number;
  refreshToken: string;
}

export interface GiraSession extends SessionTokens {
  analyticsAccountKey?: string | null;
  createdAt: number;
  expiresAt: number;
  id: string;
  needsCookieSync?: boolean;
  user: UserSummary | null;
}

export interface RequestWithMeta extends IncomingMessage {
  __clearAuthCookies?: boolean;
}

export type ResponseLike = ServerResponse<IncomingMessage>;

export interface PublicStationRecord {
  latitude: number;
  longitude: number;
  normalizedName: string;
  shortCode: string;
}

export interface AppServerOptions {
  analyticsStore?: AnalyticsStore;
  clearIntervalFn?: typeof globalThis.clearInterval;
  fetchStations?: (session: GiraSession) => Promise<Station[]>;
  fetchUser?: (session: GiraSession) => Promise<UserSummary | null>;
  host?: string;
  loadPublicStations?: () => Promise<PublicStationRecord[]>;
  loginToGira?: (email: string, password: string) => Promise<SessionTokens>;
  now?: () => number;
  port?: number;
  refreshSession?: (session: GiraSession) => Promise<GiraSession>;
  setIntervalFn?: typeof globalThis.setInterval;
  sourceDirectory?: string;
  staticDirectories?: string[];
  trustProxy?: boolean;
}

export interface AppServerInstance {
  close: () => Promise<void>;
  handler: (request: RequestWithMeta, response: ResponseLike) => Promise<void>;
  host: string;
  port: number;
  server: Server;
  state: {
    analytics?: {
      mode: AnalyticsStoreMode;
    };
    loginAttempts: Map<string, number[]>;
    sessions: Map<string, GiraSession>;
  };
}

export interface SessionStoreOptions {
  clearIntervalFn?: typeof globalThis.clearInterval;
  now?: () => number;
  refreshSession: (session: GiraSession) => Promise<GiraSession>;
  setIntervalFn?: typeof globalThis.setInterval;
  trustProxy?: boolean;
}

export type AnalyticsStoreMode = "disabled" | "memory" | "postgres";

export interface AnalyticsEventRecord {
  accountHash: string | null;
  authenticated: boolean;
  eventName: AnalyticsEventName;
  language: TrackedLanguage;
  occurredAt: Date;
  route: AppRoutePath | null;
}

export interface AnalyticsStore {
  close?: () => Promise<void>;
  getPublicStats: (referenceTime?: Date) => Promise<AnalyticsStatsResponse>;
  mode: AnalyticsStoreMode;
  recordEvent: (event: AnalyticsEventRecord) => Promise<void>;
}
