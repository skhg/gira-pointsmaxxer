const CREDENTIALS_STORAGE_KEY = "gira-pointsmaxxer-credentials-v1";
const LEGACY_CREDENTIALS_STORAGE_KEYS = ["gira-grand-prix-credentials-v1"];

function getWebStorage() {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function createError(message, status, code) {
  const error = new Error(String(message || ""));
  error.code = code || "genericRequest";
  error.status = status;
  return error;
}

async function webApi(path, options = {}) {
  let response = null;

  try {
    response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    throw createError(error?.message, 0, "genericRequest");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw createError(data.error, response.status, data.code || "genericServer");
  }

  return data;
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

    return { email };
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
  return webApi("/api/session");
}

export async function loginWithGira(email, password) {
  return webApi("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutFromGira() {
  return webApi("/api/logout", { method: "POST" }).catch(() => ({
    authenticated: false,
  }));
}

export async function loadLiveSnapshot() {
  return webApi("/api/stations");
}
