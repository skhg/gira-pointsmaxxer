import {
  GIRA_AUTH_URL,
  GIRA_GRAPHQL_URL,
  GIRA_PUBLIC_STATIONS_URL,
  PUBLIC_STATIONS_TTL_MS,
  USER_AGENT,
} from "./config.js";
import {
  haversineKm,
  normalizeLiveStation,
  normalizeStationName,
  stripLeadingZeros,
} from "../src/lib/stations.js";
import type { AppError, Station, UserSummary } from "../src/types.js";
import type { GiraSession, PublicStationRecord, SessionTokens } from "./types.js";

interface UpstreamJsonResponse<TBody> {
  body: TBody;
  ok: boolean;
  status: number;
}

export async function upstreamJson<TBody = unknown>(url: string, options?: RequestInit): Promise<UpstreamJsonResponse<TBody>> {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? ((await response.json().catch(() => null)) as TBody)
    : ((await response.text().catch(() => "")) as TBody);

  return {
    body,
    ok: response.ok,
    status: response.status,
  };
}

export function sanitizeAuthFailure(status: number, context = "login"): AppError {
  const statusCode = status >= 400 ? status : 401;
  if (context === "refresh") {
    return Object.assign(new Error("Your Gira session expired. Please sign in again."), {
      code: "session_expired",
      statusCode,
    });
  }

  if (statusCode === 429) {
    return Object.assign(
      new Error("The Gira authentication service is temporarily rate limiting requests."),
      {
      code: "auth_rate_limited",
      statusCode,
      }
    );
  }

  return Object.assign(new Error("The Gira email or password was not accepted."), {
    code: "invalid_credentials",
    statusCode,
  });
}

export async function defaultLoginToGira(email: string, password: string): Promise<SessionTokens> {
  const response = await upstreamJson<{
    data?: SessionTokens;
  }>(`${GIRA_AUTH_URL}/login`, {
    body: JSON.stringify({
      CredentialsEmailPassword: {
        email,
        password,
      },
      Provider: "EmailPassword",
    }),
    headers: {
      "Content-Type": "application/json",
      Priority: "high",
      "User-Agent": USER_AGENT,
    },
    method: "POST",
  });

  if (!response.ok || !response.body?.data?.accessToken || !response.body?.data?.refreshToken) {
    throw sanitizeAuthFailure(response.status, "login");
  }

  return response.body.data;
}

export async function defaultRefreshSession(session: GiraSession): Promise<GiraSession> {
  const response = await upstreamJson<{
    data?: SessionTokens;
  }>(`${GIRA_AUTH_URL}/token/refresh`, {
    body: JSON.stringify({
      token: session.refreshToken,
    }),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    method: "POST",
  });

  if (!response.ok || !response.body?.data?.accessToken || !response.body?.data?.refreshToken) {
    throw sanitizeAuthFailure(response.status, "refresh");
  }

  session.accessToken = response.body.data.accessToken;
  session.refreshToken = response.body.data.refreshToken;
  session.expiration = response.body.data.expiration;
  return session;
}

export async function defaultFetchUser(session: GiraSession): Promise<UserSummary | null> {
  const response = await upstreamJson<{
    data?: {
      email?: string;
      name?: string;
    };
  }>(`${GIRA_AUTH_URL}/user`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    method: "GET",
  });

  if (!response.ok || !response.body?.data) {
    return session.user || null;
  }

  session.user = {
    email: response.body.data.email || "",
    name: response.body.data.name || response.body.data.email || "Gira user",
  };
  return session.user;
}

export function createDefaultPublicStationsLoader() {
  let publicStationsCache = {
    expiresAt: 0,
    stations: [] as PublicStationRecord[],
  };

  return async function loadPublicStations(): Promise<PublicStationRecord[]> {
    if (publicStationsCache.expiresAt > Date.now() && publicStationsCache.stations.length > 0) {
      return publicStationsCache.stations;
    }

    const response = await upstreamJson(GIRA_PUBLIC_STATIONS_URL, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      method: "GET",
    });

    if (!response.ok || !Array.isArray(response.body)) {
      throw {
        code: "public_station_catalog_unavailable",
        message: "The EMEL public station catalog is unavailable.",
        statusCode: response.status || 502,
      };
    }

    publicStationsCache = {
      expiresAt: Date.now() + PUBLIC_STATIONS_TTL_MS,
      stations: (response.body as Array<{
        estacaolocalizacao?: string;
        id_expl?: string | number;
        latitude?: number | string;
        longitude?: number | string;
      }>)
        .map(station => ({
          latitude: Number(station.latitude),
          longitude: Number(station.longitude),
          normalizedName: normalizeStationName(station.estacaolocalizacao),
          shortCode: String(station.id_expl),
        }))
        .filter(
          station =>
            station.shortCode &&
            Number.isFinite(station.latitude) &&
            Number.isFinite(station.longitude)
        ),
    };

    return publicStationsCache.stations;
  };
}

export function matchPublicStation(
  liveStation: Station,
  publicStations: PublicStationRecord[]
): PublicStationRecord | null {
  const normalizedLiveName = normalizeStationName(liveStation.name || liveStation.description || "");
  const exactNameMatches = publicStations.filter(
    station => station.normalizedName && station.normalizedName === normalizedLiveName
  );

  const chooseNearest = (candidates: PublicStationRecord[]) =>
    candidates.reduce<{ distanceKm: number; station: PublicStationRecord } | null>((best, candidate) => {
      const distanceKm = haversineKm(liveStation, candidate);
      if (!best || distanceKm < best.distanceKm) {
        return {
          distanceKm,
          station: candidate,
        };
      }
      return best;
    }, null);

  const exactMatch = chooseNearest(exactNameMatches);
  if (exactMatch) return exactMatch.station;

  const nearbyMatch = chooseNearest(
    publicStations.filter(station => haversineKm(liveStation, station) <= 0.08)
  );
  if (nearbyMatch) return nearbyMatch.station;

  return null;
}

export function createDefaultStationFetcher({
  refreshSession,
  loadPublicStations,
}: {
  loadPublicStations: () => Promise<PublicStationRecord[]>;
  refreshSession: (session: GiraSession) => Promise<GiraSession>;
}) {
  return async function fetchStations(session: GiraSession, retry = true): Promise<Station[]> {
    const response = await upstreamJson<{
      data?: {
        getStations?: Array<Record<string, unknown>>;
      };
    }>(GIRA_GRAPHQL_URL, {
      body: JSON.stringify({
        operationName: "getStations",
        query:
          "query getStations {getStations { code, description, latitude, longitude, name, bikes, docks, serialNumber, assetStatus }}",
        variables: {},
      }),
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      method: "POST",
    });

    if (response.status === 401 && retry) {
      await refreshSession(session);
      return fetchStations(session, false);
    }

    if (!response.ok || !response.body?.data?.getStations) {
      throw {
        code: "live_station_snapshot_unavailable",
        message: "The Gira live station API did not return a usable snapshot.",
        statusCode: response.status || 502,
      };
    }

    const publicStations = await loadPublicStations().catch(() => []);

    return response.body.data.getStations
      .filter(station => station && station.code && station.serialNumber)
      .map(station => {
        const normalizedStation = normalizeLiveStation(station);
        const publicMatch = matchPublicStation(normalizedStation, publicStations);

        return {
          ...normalizedStation,
          displayCode: publicMatch?.shortCode || stripLeadingZeros(normalizedStation.code),
        };
      });
  };
}

export function sessionSummary(session: GiraSession) {
  return {
    authenticated: true,
    user: session.user || null,
  };
}
