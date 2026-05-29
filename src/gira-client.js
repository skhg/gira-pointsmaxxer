import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const GIRA_AUTH_URL = "https://c2g091p01.emel.pt/auth";
const GIRA_GRAPHQL_URL = "https://c2g091p01.emel.pt/ws/graphql";
const GIRA_PUBLIC_STATIONS_URL =
  "https://dados.emel.pt/dataset/57181518-0708-4fb5-a7d1-69875dee8478/resource/d1950d9d-26be-4ced-b1c4-9af65c8d2c70/download/girastations.json";
const USER_AGENT = "Gira Grand Prix/0.1 (Capacitor)";
const PUBLIC_STATIONS_TTL_MS = 1000 * 60 * 60 * 12;
const SESSION_STORAGE_KEY = "gira-grand-prix-session-v1";
const CREDENTIALS_STORAGE_KEY = "gira-grand-prix-credentials-v1";
const STATIONS_QUERY =
  "query getStations {getStations { code, description, latitude, longitude, name, bikes, docks, serialNumber, assetStatus }}";

const IS_NATIVE_APP = Capacitor.getPlatform() !== "web";

let cachedSession;
let publicStationsCache = {
  expiresAt: 0,
  stations: [],
};

function getWebStorage() {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

async function getStoredValue(key) {
  if (IS_NATIVE_APP) {
    const { value } = await Preferences.get({ key });
    return value;
  }

  return getWebStorage()?.getItem(key) ?? null;
}

async function setStoredValue(key, value) {
  if (IS_NATIVE_APP) {
    await Preferences.set({ key, value });
    return;
  }

  if (getWebStorage()) {
    getWebStorage().setItem(key, value);
  }
}

async function removeStoredValue(key) {
  if (IS_NATIVE_APP) {
    await Preferences.remove({ key });
    return;
  }

  if (getWebStorage()) {
    getWebStorage().removeItem(key);
  }
}

function createError(message, status) {
  const error = new Error(message || "Request failed.");
  error.status = status;
  return error;
}

function parseJsonIfNeeded(value) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function webApi(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw createError(data.error || "Request failed.", response.status);
  }

  return data;
}

async function nativeJsonRequest(url, options = {}) {
  const method = options.method || "GET";
  const response = await CapacitorHttp.request({
    connectTimeout: 20000,
    data: options.body ? parseJsonIfNeeded(options.body) : undefined,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    method,
    readTimeout: 20000,
    responseType: "json",
    url,
  });

  const data = parseJsonIfNeeded(response.data);

  if (response.status < 200 || response.status >= 300) {
    const message =
      data?.error?.message ||
      data?.error ||
      data?.statusDescription ||
      "The upstream service rejected the request.";
    throw createError(message, response.status);
  }

  return data;
}

async function loadStoredSession() {
  if (!IS_NATIVE_APP) return null;
  if (cachedSession !== undefined) return cachedSession;

  const value = await getStoredValue(SESSION_STORAGE_KEY);

  if (!value) {
    cachedSession = null;
    return cachedSession;
  }

  try {
    cachedSession = JSON.parse(value);
  } catch {
    cachedSession = null;
    await removeStoredValue(SESSION_STORAGE_KEY);
  }

  return cachedSession;
}

async function saveSession(session) {
  if (!IS_NATIVE_APP) return;
  cachedSession = session;
  await setStoredValue(SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function clearSession() {
  cachedSession = null;
  if (IS_NATIVE_APP) {
    await removeStoredValue(SESSION_STORAGE_KEY);
  }
}

export async function loadSavedCredentials() {
  const value = await getStoredValue(CREDENTIALS_STORAGE_KEY);
  if (!value) return null;

  try {
    const credentials = JSON.parse(value);
    const email = String(credentials?.email || "").trim();
    if (!email) {
      await clearSavedCredentials();
      return null;
    }

    if (credentials?.password) {
      await setStoredValue(
        CREDENTIALS_STORAGE_KEY,
        JSON.stringify({
          email,
        })
      );
    }

    return {
      email,
    };
  } catch {
    await clearSavedCredentials();
    return null;
  }
}

export async function saveCredentials(email) {
  const normalizedEmail = String(email || "").trim();

  if (!normalizedEmail) {
    await clearSavedCredentials();
    return;
  }

  await setStoredValue(
    CREDENTIALS_STORAGE_KEY,
    JSON.stringify({
      email: normalizedEmail,
    })
  );
}

export async function clearSavedCredentials() {
  await removeStoredValue(CREDENTIALS_STORAGE_KEY);
}

function normalizeStationName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^\d+\s*-\s*/u, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function haversineKm(from, to) {
  const earthRadiusKm = 6371;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stripLeadingZeros(value) {
  const stripped = String(value ?? "").replace(/^0+(?=\d)/, "");
  return stripped || String(value ?? "");
}

async function loginNative(email, password) {
  let data;

  try {
    data = await nativeJsonRequest(`${GIRA_AUTH_URL}/login`, {
      method: "POST",
      headers: {
        Priority: "high",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        Provider: "EmailPassword",
        CredentialsEmailPassword: {
          email,
          password,
        },
      }),
    });
  } catch (error) {
    if (error?.status === 429) {
      throw createError(
        "The Gira authentication service is temporarily rate limiting requests.",
        429
      );
    }
    throw createError("The Gira email or password was not accepted.", error?.status || 401);
  }

  if (!data?.data?.accessToken || !data?.data?.refreshToken) {
    throw createError("The Gira email or password was not accepted.", 401);
  }

  return data.data;
}

async function refreshNativeSession(session) {
  let data;

  try {
    data = await nativeJsonRequest(`${GIRA_AUTH_URL}/token/refresh`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        token: session.refreshToken,
      }),
    });
  } catch (error) {
    throw createError("Your Gira session expired. Please sign in again.", error?.status || 401);
  }

  if (!data?.data?.accessToken || !data?.data?.refreshToken) {
    throw createError("Your Gira session expired. Please sign in again.", 401);
  }

  session.accessToken = data.data.accessToken;
  session.refreshToken = data.data.refreshToken;
  session.expiration = data.data.expiration;
  await saveSession(session);
  return session;
}

async function fetchNativeUser(session) {
  const data = await nativeJsonRequest(`${GIRA_AUTH_URL}/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "User-Agent": USER_AGENT,
    },
  });

  if (!data?.data) {
    return session.user || null;
  }

  session.user = {
    email: data.data.email || "",
    name: data.data.name || data.data.email || "Gira user",
  };
  await saveSession(session);
  return session.user;
}

async function loadPublicStations() {
  if (publicStationsCache.expiresAt > Date.now() && publicStationsCache.stations.length > 0) {
    return publicStationsCache.stations;
  }

  const data = await nativeJsonRequest(GIRA_PUBLIC_STATIONS_URL, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
    },
  });

  if (!Array.isArray(data)) {
    throw createError("The EMEL public station catalog is unavailable.", 502);
  }

  publicStationsCache = {
    expiresAt: Date.now() + PUBLIC_STATIONS_TTL_MS,
    stations: data
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
}

function matchPublicStation(liveStation, publicStations) {
  const normalizedLiveName = normalizeStationName(liveStation.name || liveStation.description || "");
  const exactNameMatches = publicStations.filter(
    station => station.normalizedName && station.normalizedName === normalizedLiveName
  );

  const chooseNearest = candidates =>
    candidates.reduce((best, candidate) => {
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

async function fetchNativeStations(session, retry = true) {
  let data;

  try {
    data = await nativeJsonRequest(GIRA_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        operationName: "getStations",
        variables: {},
        query: STATIONS_QUERY,
      }),
    });
  } catch (error) {
    if (error.status === 401 && retry) {
      await refreshNativeSession(session);
      return fetchNativeStations(session, false);
    }
    throw error;
  }

  if (!data?.data?.getStations) {
    throw createError("The Gira live station API did not return a usable snapshot.", 502);
  }

  const publicStations = await loadPublicStations().catch(() => []);

  return data.data.getStations
    .filter(station => station && station.code && station.serialNumber)
    .map(station => {
      const normalizedStation = {
        assetStatus: station.assetStatus || "unknown",
        bikes: Number(station.bikes ?? 0),
        code: String(station.code),
        description: station.description || null,
        docks: Number(station.docks ?? 0),
        latitude: Number(station.latitude),
        longitude: Number(station.longitude),
        name: station.name || station.description || `Station ${station.code}`,
        serialNumber: String(station.serialNumber),
      };

      const publicMatch = matchPublicStation(normalizedStation, publicStations);

      return {
        ...normalizedStation,
        displayCode: publicMatch?.shortCode || stripLeadingZeros(normalizedStation.code),
      };
    });
}

export function isNativeRuntime() {
  return IS_NATIVE_APP;
}

export function getRuntimeLabel() {
  return IS_NATIVE_APP ? "this device" : "this local machine";
}

export async function getSessionSummary() {
  if (!IS_NATIVE_APP) {
    return webApi("/api/session");
  }

  const session = await loadStoredSession();
  if (!session?.accessToken) {
    return {
      authenticated: false,
    };
  }

  return {
    authenticated: true,
    user: session.user || null,
  };
}

export async function loginWithGira(email, password) {
  if (!IS_NATIVE_APP) {
    return webApi("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  const tokens = await loginNative(email, password);
  const session = {
    accessToken: tokens.accessToken,
    expiration: tokens.expiration,
    refreshToken: tokens.refreshToken,
    user: {
      email,
      name: email,
    },
  };

  await saveSession(session);
  await fetchNativeUser(session).catch(() => null);

  return {
    authenticated: true,
    user: session.user || null,
  };
}

export async function logoutFromGira() {
  if (!IS_NATIVE_APP) {
    return webApi("/api/logout", { method: "POST" }).catch(() => ({
      authenticated: false,
    }));
  }

  await clearSession();
  return {
    authenticated: false,
  };
}

export async function loadLiveSnapshot() {
  if (!IS_NATIVE_APP) {
    return webApi("/api/stations");
  }

  const session = await loadStoredSession();
  if (!session?.accessToken) {
    throw createError("You need to log in with your Gira account first.", 401);
  }

  const stations = await fetchNativeStations(session);
  if (!session.user) {
    await fetchNativeUser(session).catch(() => null);
  }
  await saveSession(session);

  return {
    fetchedAt: new Date().toISOString(),
    source: "live",
    stationCount: stations.length,
    stations,
    user: session.user || null,
  };
}
