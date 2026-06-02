import {
  clearSavedCredentials,
  getSessionSummary,
  loadSavedCredentials,
  loadLiveSnapshot,
  loginWithGira,
  logoutFromGira,
  saveCredentials,
} from "../gira-client.js";
import type { MessageValues, StationLike, UserSummary } from "../types.js";
import type { AppElements } from "./app-elements.js";
import type { AppState } from "./app-state.js";
import { demoStations } from "../../testing/fixtures/demo-stations.js";

interface AuthControllerOptions {
  elements: Pick<
    AppElements,
    | "authPanel"
    | "authSummary"
    | "demoButton"
    | "emailInput"
    | "loadLiveButton"
    | "loginButton"
    | "loginForm"
    | "logoutButton"
    | "passwordInput"
    | "rememberEmailCheckbox"
    | "sessionStatus"
  >;
  getErrorMessage: (error: unknown) => string;
  isLocalDevelopmentHost: () => boolean;
  onSignInSuccess?: () => void;
  onStationsRefreshed?: () => void;
  setStations: (stations: StationLike[], source: string, fetchedAt: string) => void;
  showToast: (message: string, type?: string) => void;
  state: AppState;
  translate: (key: string, values?: MessageValues) => string;
}

export function createAuthController({
  elements,
  getErrorMessage,
  isLocalDevelopmentHost,
  onSignInSuccess,
  onStationsRefreshed,
  setStations,
  showToast,
  state,
  translate: t,
}: AuthControllerOptions) {
  function setUser(user: UserSummary | null) {
    state.user = user;

    const authenticated = Boolean(user);
    const userLabel = user?.name || user?.email || t("auth.sessionSignedIn");

    elements.authPanel.classList.toggle("panel--auth-signed-in", authenticated);
    elements.loginForm.hidden = authenticated;
    elements.sessionStatus.textContent = authenticated ? userLabel : t("auth.sessionSignedOut");
    elements.logoutButton.hidden = !authenticated;
    elements.loadLiveButton.hidden = !authenticated;
    elements.loadLiveButton.disabled = !authenticated;
    elements.loginButton.disabled = false;
    elements.demoButton.hidden = authenticated || !isLocalDevelopmentHost();
    elements.loginButton.textContent = t("auth.signIn");
    elements.loadLiveButton.textContent = t("snapshot.refreshLiveStations");
    elements.authSummary.textContent = authenticated
      ? t("auth.summarySignedIn", {
          name: userLabel,
        })
      : t("auth.summarySignedOut");
  }

  async function syncSession() {
    const data = await getSessionSummary();
    setUser(data.authenticated ? data.user : null);
  }

  async function hydrateSavedCredentials() {
    const savedCredentials = await loadSavedCredentials().catch(() => null);
    if (!savedCredentials) return;

    elements.emailInput.value = savedCredentials.email;
    elements.rememberEmailCheckbox.checked = savedCredentials.rememberEmail === true;
  }

  async function login(event: SubmitEvent) {
    event.preventDefault();
    elements.loginButton.disabled = true;
    elements.loginButton.textContent = t("auth.signingIn");

    const email = elements.emailInput.value.trim();
    const password = elements.passwordInput.value;
    const rememberEmail = elements.rememberEmailCheckbox.checked;

    try {
      const data = await loginWithGira(email, password);
      await saveCredentials(email, rememberEmail).catch(() => null);
      elements.passwordInput.value = "";

      setUser(data.user);
      onSignInSuccess?.();
      showToast(t("toasts.signInAndLoad"));
      await loadLiveStations();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      elements.loginButton.disabled = false;
      elements.loginButton.textContent = t("auth.signIn");
    }
  }

  async function logout() {
    const shouldKeepEmail = elements.rememberEmailCheckbox.checked;
    await Promise.allSettled([
      logoutFromGira(),
      shouldKeepEmail ? saveCredentials(elements.emailInput.value, true) : clearSavedCredentials(),
    ]);
    setUser(null);
    if (!shouldKeepEmail) {
      elements.emailInput.value = "";
      elements.rememberEmailCheckbox.checked = false;
    }
    elements.passwordInput.value = "";
    elements.loginButton.textContent = t("auth.signIn");
    showToast(t("toasts.signOutCleared"));
  }

  async function loadLiveStations() {
    elements.loadLiveButton.disabled = true;
    elements.loadLiveButton.textContent = t("snapshot.refreshing");

    try {
      const data = await loadLiveSnapshot();
      setStations(data.stations, data.source, data.fetchedAt);
      setUser(data.user || state.user);
      onStationsRefreshed?.();
      showToast(
        t("snapshot.loadedLiveStations", {
          count: data.stationCount,
        })
      );
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      elements.loadLiveButton.disabled = !state.user;
      elements.loadLiveButton.textContent = t("snapshot.refreshLiveStations");
      elements.loginButton.disabled = false;
      elements.loginButton.textContent = t("auth.signIn");
    }
  }

  function loadDemoStations() {
    setStations(demoStations, "demo", new Date().toISOString());
    showToast(t("snapshot.loadedDemoSnapshot"));
  }

  return {
    hydrateSavedCredentials,
    loadDemoStations,
    loadLiveStations,
    login,
    logout,
    setUser,
    syncSession,
  };
}
