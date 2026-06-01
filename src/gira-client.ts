import type {
  AppError,
  LiveSnapshotResponse,
  SavedCredentials,
  SessionSummaryResponse,
  UserSummary,
} from "./types.js";

const CREDENTIALS_STORAGE_KEY = "gira-pointsmaxxer-credentials-v1";
const LEGACY_CREDENTIALS_STORAGE_KEYS = ["gira-grand-prix-credentials-v1"];

function getWebStorage() {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function createError(message: unknown, status: number, code: string) {
  const error = new Error(String(message || "")) as AppError;
  error.code = code || "genericRequest";
  error.status = status;
  return error;
}

function toPlainHeaders(headers?: HeadersInit) {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

async function webApi<TResponse>(path: string, options: RequestInit = {}): Promise<TResponse> {
  let response;

  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...toPlainHeaders(options.headers),
      },
    });
  } catch (error) {
    throw createError((error as Error | undefined)?.message, 0, "genericRequest");
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw createError(data.error, response.status, String(data.code || "genericServer"));
  }

  return data as TResponse;
}

async function getStoredValue(key) {
  return getWebStorage()?.getItem(key) ?? null;
}

async function setStoredValue(key, value) {
  getWebStorage()?.setItem(key, value);
}

async function removeStoredValue(key) {
  getWebStorage()?.removeItem(key);
}

export async function loadSavedCredentials() {
  let value = await getStoredValue(CREDENTIALS_STORAGE_KEY);

  if (!value) {
    for (const legacyKey of LEGACY_CREDENTIALS_STORAGE_KEYS) {
      value = await getStoredValue(legacyKey);
      if (value) {
        await setStoredValue(CREDENTIALS_STORAGE_KEY, value);
        await removeStoredValue(legacyKey);
        break;
      }
    }
  }

  if (!value) return null;

  try {
    const credentials = JSON.parse(value) as Partial<SavedCredentials> & { password?: string };
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

    return { email } satisfies SavedCredentials;
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

export async function getSessionSummary() {
  return webApi<SessionSummaryResponse>("/api/session");
}

export async function loginWithGira(email, password) {
  return webApi<SessionSummaryResponse & { user: UserSummary }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutFromGira() {
  return webApi<SessionSummaryResponse>("/api/logout", { method: "POST" }).catch(() => ({
    authenticated: false,
    user: null,
  }));
}

export async function loadLiveSnapshot() {
  return webApi<LiveSnapshotResponse>("/api/stations");
}
