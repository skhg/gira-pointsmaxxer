import {
  clearSavedCredentials,
  getSessionSummary,
  loadSavedCredentials,
  loadLiveSnapshot,
  loginWithGira,
  logoutFromGira,
  saveCredentials,
} from "./gira-client.js";
import {
  DEFAULT_EMPTY_THRESHOLD,
  DEFAULT_OCCUPIED_THRESHOLD,
  computeOptimalPlan,
  findNearestStation,
  finishBonusRatioAfterDock,
  occupiedRatioNow,
} from "./lib/planner.js";
import { CREDITS_ROUTE, PLANNER_ROUTE, normalizeAppPath, resolveAppRoute } from "./lib/app-routes.js";
import {
  buildDefaultFinishTimeValue,
  FINISH_TIME_REFRESH_MS,
  MINIMUM_REMAINING_MINUTES,
  getFinishTimeStatus as computeFinishTimeStatus,
} from "./lib/finish-time.js";
import { decorateStationForDisplay, sortStationsByLabel } from "./lib/stations.js";
import {
  SUPPORTED_LANGUAGES,
  detectInitialLanguage,
  getMessages,
  hasTranslation,
  resolveLanguage,
  storeLanguage,
  translate,
} from "./i18n.js";
import { createCreditsRenderer } from "./ui/credits.js";
import { createNetworkMapController } from "./ui/network-map.js";
import { demoStations } from "../testing/fixtures/demo-stations.js";
import type {
  AppError,
  CreditsSection,
  CurrentLocationState,
  LocationSnapshot,
  MessageValues,
  Plan,
  Station,
  StationLike,
  UserSummary,
} from "./types.js";

const CURRENT_LOCATION_VALUE = "__current_location__";
const CURRENT_LOCATION_ORIGIN_CODE = "__current_location_origin__";
const CURRENT_LOCATION_CACHE_MS = 1000 * 60 * 2;

interface AppState {
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

function getRequiredElement<TElement extends Element>(id: string): TElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required DOM element #${id}`);
  }

  return element as unknown as TElement;
}

const state: AppState = {
  currentLocation: null,
  currentRoute: PLANNER_ROUTE,
  language: detectInitialLanguage(),
  source: null,
  fetchedAt: null,
  isResolvingCurrentLocation: false,
  plan: null,
  stationByCode: new Map(),
  stations: [],
  user: null,
};

const elements = {
  appFooter: getRequiredElement<HTMLElement>("appFooter"),
  authPanel: getRequiredElement<HTMLElement>("authPanel"),
  authSummary: getRequiredElement<HTMLElement>("authSummary"),
  authSectionTitle: getRequiredElement<HTMLElement>("authSectionTitle"),
  authStepEyebrow: getRequiredElement<HTMLElement>("authStepEyebrow"),
  backToPlannerLink: getRequiredElement<HTMLAnchorElement>("backToPlannerLink"),
  creditsHero: getRequiredElement<HTMLElement>("creditsHero"),
  creditsHeroEyebrow: getRequiredElement<HTMLElement>("creditsHeroEyebrow"),
  creditsHeroLede: getRequiredElement<HTMLElement>("creditsHeroLede"),
  creditsHeroTitle: getRequiredElement<HTMLElement>("creditsHeroTitle"),
  creditsPage: getRequiredElement<HTMLElement>("creditsPage"),
  creditsPanelEyebrow: getRequiredElement<HTMLElement>("creditsPanelEyebrow"),
  creditsPanelTitle: getRequiredElement<HTMLElement>("creditsPanelTitle"),
  creditsSections: getRequiredElement<HTMLElement>("creditsSections"),
  controlsSectionTitle: getRequiredElement<HTMLElement>("controlsSectionTitle"),
  controlsStepEyebrow: getRequiredElement<HTMLElement>("controlsStepEyebrow"),
  currentLocationButton: getRequiredElement<HTMLButtonElement>("currentLocationButton"),
  demoButton: getRequiredElement<HTMLButtonElement>("demoButton"),
  detourInput: getRequiredElement<HTMLInputElement>("detourInput"),
  detourLabel: getRequiredElement<HTMLElement>("detourLabel"),
  distanceLabel: getRequiredElement<HTMLElement>("distanceLabel"),
  distanceValue: getRequiredElement<HTMLElement>("distanceValue"),
  emailInput: getRequiredElement<HTMLInputElement>("emailInput"),
  emailLabel: getRequiredElement<HTMLElement>("emailLabel"),
  endInput: getRequiredElement<HTMLSelectElement>("endInput"),
  endStationLabel: getRequiredElement<HTMLElement>("endStationLabel"),
  finishTimeInput: getRequiredElement<HTMLInputElement>("finishTimeInput"),
  finishTimeLabel: getRequiredElement<HTMLElement>("finishTimeLabel"),
  finishTimeNote: getRequiredElement<HTMLElement>("finishTimeNote"),
  footerCreditsLink: getRequiredElement<HTMLAnchorElement>("footerCreditsLink"),
  languageLabel: getRequiredElement<HTMLElement>("languageLabel"),
  languageSelect: getRequiredElement<HTMLSelectElement>("languageSelect"),
  legendEmpty: getRequiredElement<HTMLElement>("legendEmpty"),
  legendOccupied: getRequiredElement<HTMLElement>("legendOccupied"),
  legendRoute: getRequiredElement<HTMLElement>("legendRoute"),
  loadLiveButton: getRequiredElement<HTMLButtonElement>("loadLiveButton"),
  loginButton: getRequiredElement<HTMLButtonElement>("loginButton"),
  loginForm: getRequiredElement<HTMLFormElement>("loginForm"),
  logoutButton: getRequiredElement<HTMLButtonElement>("logoutButton"),
  networkAttribution: getRequiredElement<HTMLElement>("networkAttribution"),
  networkEyebrow: getRequiredElement<HTMLElement>("networkEyebrow"),
  networkSectionTitle: getRequiredElement<HTMLElement>("networkSectionTitle"),
  networkSvg: getRequiredElement<SVGSVGElement>("networkSvg"),
  networkTooltip: getRequiredElement<HTMLElement>("networkTooltip"),
  overheadInput: getRequiredElement<HTMLInputElement>("overheadInput"),
  overheadLabel: getRequiredElement<HTMLElement>("overheadLabel"),
  passwordInput: getRequiredElement<HTMLInputElement>("passwordInput"),
  passwordLabel: getRequiredElement<HTMLElement>("passwordLabel"),
  planButton: getRequiredElement<HTMLButtonElement>("planButton"),
  plannerEyebrow: getRequiredElement<HTMLElement>("plannerEyebrow"),
  plannerHero: getRequiredElement<HTMLElement>("plannerHero"),
  plannerLedeText: getRequiredElement<HTMLElement>("plannerLedeText"),
  plannerNote: getRequiredElement<HTMLElement>("plannerNote"),
  plannerPage: getRequiredElement<HTMLElement>("plannerPage"),
  plannerTitle: getRequiredElement<HTMLElement>("plannerTitle"),
  plannerWhatIsThisLink: getRequiredElement<HTMLAnchorElement>("plannerWhatIsThisLink"),
  pointsLabel: getRequiredElement<HTMLElement>("pointsLabel"),
  pointsValue: getRequiredElement<HTMLElement>("pointsValue"),
  ridesLabel: getRequiredElement<HTMLElement>("ridesLabel"),
  ridesValue: getRequiredElement<HTMLElement>("ridesValue"),
  routeEyebrow: getRequiredElement<HTMLElement>("routeEyebrow"),
  routeLinks: Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-route]")),
  routeList: getRequiredElement<HTMLElement>("routeList"),
  routeSectionTitle: getRequiredElement<HTMLElement>("routeSectionTitle"),
  rideTimeLabel: getRequiredElement<HTMLElement>("rideTimeLabel"),
  sessionLabel: getRequiredElement<HTMLElement>("sessionLabel"),
  sessionStatus: getRequiredElement<HTMLElement>("sessionStatus"),
  snapshotDisclosureSummary: getRequiredElement<HTMLElement>("snapshotDisclosureSummary"),
  snapshotLabel: getRequiredElement<HTMLElement>("snapshotLabel"),
  snapshotSource: getRequiredElement<HTMLElement>("snapshotSource"),
  speedInput: getRequiredElement<HTMLInputElement>("speedInput"),
  speedLabel: getRequiredElement<HTMLElement>("speedLabel"),
  startInput: getRequiredElement<HTMLSelectElement>("startInput"),
  startStationLabel: getRequiredElement<HTMLElement>("startStationLabel"),
  stationCount: getRequiredElement<HTMLElement>("stationCount"),
  stationsLabel: getRequiredElement<HTMLElement>("stationsLabel"),
  summaryDetails: getRequiredElement<HTMLElement>("summaryDetails"),
  summarySectionTitle: getRequiredElement<HTMLElement>("summarySectionTitle"),
  summaryStepEyebrow: getRequiredElement<HTMLElement>("summaryStepEyebrow"),
  timeValue: getRequiredElement<HTMLElement>("timeValue"),
  toast: getRequiredElement<HTMLElement>("toast"),
};

const creditsRenderer = createCreditsRenderer({
  container: elements.creditsSections,
});
const networkMap = createNetworkMapController({
  plannerRoute: PLANNER_ROUTE,
  svg: elements.networkSvg,
  tooltip: elements.networkTooltip,
  translate: t,
});

function t(key, values = {}) {
  return translate(state.language, key, values);
}

function hasText(key) {
  return hasTranslation(state.language, key);
}

function getLocale() {
  return getMessages(state.language).locale;
}

let toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string, type = "info") {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  elements.toast.dataset.type = type;
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }
  toastTimeoutId = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4000);
}

function createAppError(translationKey: string, values: MessageValues = {}): AppError {
  const error = new Error(translationKey) as AppError;
  error.translationKey = translationKey;
  error.translationValues = values;
  return error;
}

function getErrorMessage(error: unknown) {
  const typedError = error as AppError | null | undefined;
  if (typedError?.translationKey) {
    return t(typedError.translationKey, typedError.translationValues || {});
  }

  if (typedError?.code && hasText(`errors.${typedError.code}`)) {
    return t(`errors.${typedError.code}`);
  }

  return typedError?.message || t("errors.genericRequest");
}

function renderCreditsSections() {
  creditsRenderer.renderSections(getMessages(state.language).credits.sections as CreditsSection[]);
}

function applyStaticTranslations() {
  document.documentElement.lang = state.language;
  elements.languageLabel.textContent = t("language.label");
  elements.plannerEyebrow.textContent = t("hero.eyebrow");
  elements.plannerTitle.textContent = t("hero.title");
  elements.plannerLedeText.textContent = `${t("hero.lede")} `;
  elements.plannerWhatIsThisLink.textContent = t("hero.whatIsThis");
  elements.creditsHeroEyebrow.textContent = t("creditsHero.eyebrow");
  elements.creditsHeroTitle.textContent = t("creditsHero.title");
  elements.creditsHeroLede.textContent = t("creditsHero.lede");
  elements.authStepEyebrow.textContent = t("auth.step");
  elements.authSectionTitle.textContent = t("auth.title");
  elements.emailLabel.textContent = t("auth.emailLabel");
  elements.passwordLabel.textContent = t("auth.passwordLabel");
  elements.logoutButton.textContent = t("auth.logout");
  elements.demoButton.textContent = t("auth.useDemoSnapshot");
  elements.snapshotDisclosureSummary.textContent = t("snapshot.disclosure");
  elements.snapshotLabel.textContent = t("snapshot.snapshot");
  elements.stationsLabel.textContent = t("snapshot.stations");
  elements.sessionLabel.textContent = t("snapshot.session");
  elements.controlsStepEyebrow.textContent = t("controls.step");
  elements.controlsSectionTitle.textContent = t("controls.title");
  elements.startStationLabel.textContent = t("controls.startStation");
  elements.endStationLabel.textContent = t("controls.finishStation");
  elements.finishTimeLabel.textContent = t("controls.finishTime");
  elements.speedLabel.textContent = t("controls.speed");
  elements.detourLabel.textContent = t("controls.detourFactor");
  elements.overheadLabel.textContent = t("controls.overhead");
  elements.currentLocationButton.setAttribute("aria-label", t("controls.currentLocationButtonLabel"));
  elements.currentLocationButton.setAttribute("title", t("controls.currentLocationButtonLabel"));
  elements.planButton.textContent = t("controls.findBestStrategy");
  elements.plannerNote.textContent = t("controls.plannerNote");
  elements.summaryStepEyebrow.textContent = t("summary.step");
  elements.summarySectionTitle.textContent = t("summary.title");
  elements.pointsLabel.textContent = t("summary.points");
  elements.ridesLabel.textContent = t("summary.rides");
  elements.rideTimeLabel.textContent = t("summary.rideTime");
  elements.distanceLabel.textContent = t("summary.distance");
  elements.networkEyebrow.textContent = t("network.eyebrow");
  elements.networkSectionTitle.textContent = t("network.title");
  elements.legendOccupied.textContent = t("network.legendOccupied");
  elements.legendEmpty.textContent = t("network.legendEmpty");
  elements.legendRoute.textContent = t("network.legendRoute");
  elements.networkSvg.setAttribute("aria-label", t("network.ariaLabel"));
  elements.networkAttribution.textContent = t("network.attribution");
  elements.routeEyebrow.textContent = t("route.eyebrow");
  elements.routeSectionTitle.textContent = t("route.title");
  elements.creditsPanelEyebrow.textContent = t("credits.panelEyebrow");
  elements.creditsPanelTitle.textContent = t("credits.panelTitle");
  elements.backToPlannerLink.textContent = t("credits.backToPlanner");
  elements.footerCreditsLink.textContent = t("credits.footerLink");
  renderCreditsSections();
}

function initializeLanguagePicker() {
  elements.languageSelect.innerHTML = "";

  for (const language of SUPPORTED_LANGUAGES) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.label;
    elements.languageSelect.appendChild(option);
  }
}

function applyLanguage(options: { persist?: boolean } = {}) {
  const { persist = false } = options;
  state.language = resolveLanguage(state.language);
  elements.languageSelect.value = state.language;
  if (persist) {
    storeLanguage(state.language);
  }

  applyStaticTranslations();
  updateDocumentTitle(state.currentRoute);
  setUser(state.user);
  renderStationOptions();
  renderSnapshotMeta();
  renderPlan(state.plan);
  updatePlannerAvailability();
}

function hideNetworkTooltip() {
  networkMap.hideTooltip();
}

function isLocalDevelopmentHost() {
  return ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname || "");
}

function syncCanonicalRoute() {
  const currentPath = normalizeAppPath(globalThis.location?.pathname || PLANNER_ROUTE);
  const canonicalRoute = resolveAppRoute(currentPath);

  if (currentPath !== canonicalRoute) {
    globalThis.history.replaceState({}, "", canonicalRoute);
  }

  state.currentRoute = canonicalRoute;
  return canonicalRoute;
}

function updateDocumentTitle(route) {
  document.title = route === CREDITS_ROUTE ? t("creditsPageTitle") : t("pageTitle");
}

function renderRoute(options: { scrollTop?: boolean } = {}) {
  const { scrollTop = false } = options;
  const route = syncCanonicalRoute();
  const showingCredits = route === CREDITS_ROUTE;

  elements.plannerHero.hidden = showingCredits;
  elements.plannerPage.hidden = showingCredits;
  elements.appFooter.hidden = showingCredits;
  elements.creditsHero.hidden = !showingCredits;
  elements.creditsPage.hidden = !showingCredits;

  updateDocumentTitle(route);

  if (showingCredits) {
    hideNetworkTooltip();
  } else {
    globalThis.requestAnimationFrame(() => {
      drawNetwork();
    });
  }

  if (scrollTop) {
    globalThis.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }
}

function navigateToRoute(pathname) {
  const targetRoute = resolveAppRoute(pathname);
  const currentRoute = resolveAppRoute(globalThis.location?.pathname || PLANNER_ROUTE);
  if (currentRoute !== targetRoute || normalizeAppPath(globalThis.location.pathname) !== targetRoute) {
    globalThis.history.pushState({}, "", targetRoute);
  }

  renderRoute({ scrollTop: true });
}

function attachRouteLinkHandlers() {
  for (const link of elements.routeLinks) {
    link.addEventListener("click", event => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.defaultPrevented || mouseEvent.button !== 0) return;
      if (mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) return;

      mouseEvent.preventDefault();
      navigateToRoute(link.getAttribute("href") || PLANNER_ROUTE);
    });
  }
}

function formatClockTime(date) {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMinuteValue(value, decimals = 0) {
  const safeValue = Math.max(0, Number(value) || 0);
  const displayValue = decimals > 0 ? safeValue.toFixed(decimals) : String(Math.floor(safeValue));
  const numericValue = Number(displayValue);
  const unit =
    Math.abs(numericValue - 1) < 1e-9 ? t("units.minuteOne") : t("units.minuteOther");
  return `${displayValue} ${unit}`;
}

function formatRemainingTime(minutes) {
  const totalMinutes = Math.max(0, Math.floor(minutes));
  if (totalMinutes < 60) return formatMinuteValue(totalMinutes);

  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  if (remainder === 0) return `${hours}${t("units.hour")}`;
  return `${hours}${t("units.hour")} ${formatMinuteValue(remainder)}`;
}

function initializeFinishTimeInput() {
  if (elements.finishTimeInput.value) return;
  elements.finishTimeInput.value = buildDefaultFinishTimeValue();
}

function getFinishTimeStatus(now = new Date()) {
  return computeFinishTimeStatus({
    formatClockTime,
    formatRemainingTime,
    messageFor: (key, values) => t(key, values),
    minimumRemainingMinutes: MINIMUM_REMAINING_MINUTES,
    now,
    value: elements.finishTimeInput.value,
  });
}

function updatePlannerAvailability() {
  const finishTimeStatus = getFinishTimeStatus();
  elements.finishTimeNote.textContent = finishTimeStatus.message;
  elements.finishTimeNote.dataset.state = finishTimeStatus.state;
  elements.planButton.disabled = state.stations.length === 0 || !finishTimeStatus.valid;
  elements.currentLocationButton.disabled =
    state.stations.length === 0 || state.isResolvingCurrentLocation;
  return finishTimeStatus;
}

function setStations(stations: StationLike[], source: string, fetchedAt: string) {
  const decoratedStations = stations.map(
    station => decorateStationForDisplay(station) as Station & { label: string }
  );
  state.stations = sortStationsByLabel(decoratedStations, getLocale());

  state.source = source;
  state.fetchedAt = fetchedAt;
  state.plan = null;
  state.stationByCode = new Map(state.stations.map(station => [station.code, station]));

  renderStationOptions();
  renderSnapshotMeta();
  renderPlan(null);
  drawNetwork();
}

function renderSnapshotMeta() {
  elements.snapshotSource.textContent = state.source
    ? `${state.source === "live" ? t("snapshot.live") : t("snapshot.demo")}${
        state.fetchedAt
          ? ` · ${new Date(state.fetchedAt).toLocaleTimeString(getLocale(), {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : ""
      }`
    : t("snapshot.noneLoaded");
  elements.stationCount.textContent = String(state.stations.length);
  updatePlannerAvailability();
}

function renderStationOptions() {
  const previousStartValue = elements.startInput.value;
  const previousEndValue = elements.endInput.value;

  const buildSelect = (
    selectElement: HTMLSelectElement,
    options: { includeCurrentLocation?: boolean } = {}
  ) => {
    const { includeCurrentLocation = false } = options;
    selectElement.innerHTML = "";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent =
      state.stations.length === 0
        ? state.user
          ? t("controls.refreshLiveStationsFirst")
          : t("controls.connectAccountFirst")
        : t("controls.chooseStation");
    selectElement.appendChild(placeholderOption);

    if (includeCurrentLocation) {
      const currentLocationOption = document.createElement("option");
      currentLocationOption.value = CURRENT_LOCATION_VALUE;
      currentLocationOption.textContent = state.currentLocation?.nearestStationLabel
        ? t("controls.currentLocationNearest", {
            label: state.currentLocation.nearestStationLabel,
          })
        : t("controls.currentLocation");
      selectElement.appendChild(currentLocationOption);
    }

    for (const station of state.stations) {
      const option = document.createElement("option");
      option.value = station.code;
      option.textContent = `${station.label} · ${t("network.tooltipOccupied", {
        bikes: station.bikes,
        docks: station.docks,
      })}`;
      selectElement.appendChild(option);
    }

    selectElement.disabled = state.stations.length === 0;
  };

  buildSelect(elements.startInput, { includeCurrentLocation: true });
  buildSelect(elements.endInput);

  const preferredStart = state.stations.find(station => occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD) || state.stations[0];
  const preferredEnd = state.stations.find(station => finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD) || state.stations[1];

  const canReuseStart =
    previousStartValue === CURRENT_LOCATION_VALUE || state.stationByCode.has(previousStartValue);
  const canReuseEnd = state.stationByCode.has(previousEndValue);

  elements.startInput.value = canReuseStart ? previousStartValue : preferredStart?.code || "";
  elements.endInput.value = canReuseEnd ? previousEndValue : preferredEnd?.code || "";
}

function setUser(user: UserSummary | null) {
  state.user = user;
  const authenticated = Boolean(user);
  elements.authPanel.classList.toggle("panel--auth-signed-in", authenticated);
  elements.loginForm.hidden = authenticated;
  elements.sessionStatus.textContent = authenticated
    ? user.name || user.email || t("auth.sessionSignedIn")
    : t("auth.sessionSignedOut");
  elements.logoutButton.hidden = !authenticated;
  elements.loadLiveButton.hidden = !authenticated;
  elements.loadLiveButton.disabled = !authenticated;
  elements.loginButton.disabled = false;
  elements.demoButton.hidden = authenticated || !isLocalDevelopmentHost();
  elements.loginButton.textContent = t("auth.signIn");
  elements.loadLiveButton.textContent = t("snapshot.refreshLiveStations");
  elements.authSummary.textContent = authenticated
    ? t("auth.summarySignedIn", {
        name: user.name || user.email,
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
}

async function login(event: SubmitEvent) {
  event.preventDefault();
  elements.loginButton.disabled = true;
  elements.loginButton.textContent = t("auth.signingIn");

  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;

  try {
    const data = await loginWithGira(email, password);
    await saveCredentials(email).catch(() => null);
    elements.passwordInput.value = "";

    setUser(data.user);
    showToast(t("toasts.signInAndLoad"));
    await loadLiveStations();
  } catch (error) {
    showToast(getErrorMessage(error), "error");
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = t("auth.signIn");
  }
}

async function logout() {
  await Promise.allSettled([
    logoutFromGira(),
    clearSavedCredentials(),
  ]);
  setUser(null);
  elements.emailInput.value = "";
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

function getSelectedStation(inputElement: HTMLSelectElement) {
  return state.stationByCode.get(inputElement.value) || null;
}

function createCurrentLocationOrigin(position: Pick<LocationSnapshot, "latitude" | "longitude">): Station {
  return {
    assetStatus: "active",
    bikes: 0,
    code: CURRENT_LOCATION_ORIGIN_CODE,
    docks: 0,
    label: t("controls.currentLocation"),
    latitude: Number(position.latitude),
    longitude: Number(position.longitude),
    name: t("controls.currentLocation"),
    serialNumber: CURRENT_LOCATION_ORIGIN_CODE,
  };
}

function getCurrentLocationErrorMessage(error: GeolocationPositionError | AppError | null | undefined) {
  if (error?.code === 1) return t("errors.locationPermissionDenied");
  if (error?.code === 2) return t("errors.locationUnavailable");
  if (error?.code === 3) return t("errors.locationTimeout");
  return error?.message || t("errors.currentLocationUnavailable");
}

async function requestCurrentLocationPosition(
  options: { forceFresh?: boolean } = {}
): Promise<LocationSnapshot> {
  const { forceFresh = false } = options;
  const mockLocation = globalThis.__GIRA_GRAND_PRIX_MOCK_LOCATION__;
  if (
    mockLocation &&
    Number.isFinite(Number(mockLocation.latitude)) &&
    Number.isFinite(Number(mockLocation.longitude))
  ) {
    return {
      accuracy: Number(mockLocation.accuracy ?? 0),
      capturedAt: Date.now(),
      latitude: Number(mockLocation.latitude),
      longitude: Number(mockLocation.longitude),
    };
  }

  const mockDataset = document.documentElement?.dataset || {};
  if (
    Number.isFinite(Number(mockDataset.mockLocationLatitude)) &&
    Number.isFinite(Number(mockDataset.mockLocationLongitude))
  ) {
    return {
      accuracy: Number(mockDataset.mockLocationAccuracy ?? 0),
      capturedAt: Date.now(),
      latitude: Number(mockDataset.mockLocationLatitude),
      longitude: Number(mockDataset.mockLocationLongitude),
    };
  }

  if (!navigator.geolocation) {
    throw createAppError("errors.geolocationUnsupported");
  }

  return new Promise<LocationSnapshot>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          accuracy: Number(position.coords.accuracy ?? 0),
          capturedAt: Date.now(),
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
        });
      },
      error => {
        reject(new Error(getCurrentLocationErrorMessage(error)));
      },
      {
        enableHighAccuracy: true,
        maximumAge: forceFresh ? 0 : CURRENT_LOCATION_CACHE_MS,
        timeout: 10000,
      }
    );
  });
}

function getCurrentLocationOption() {
  return elements.startInput.querySelector(`option[value="${CURRENT_LOCATION_VALUE}"]`);
}

function updateCurrentLocationOptionLabel() {
  const option = getCurrentLocationOption();
  if (!option) return;

  option.textContent = state.currentLocation?.nearestStationLabel
    ? t("controls.currentLocationNearest", {
        label: state.currentLocation.nearestStationLabel,
      })
    : t("controls.currentLocation");
}

async function resolveCurrentLocationStart(
  options: { forceRefresh?: boolean } = {}
): Promise<{ origin: Station; station: Station }> {
  const { forceRefresh = false } = options;
  if (state.stations.length === 0) {
    throw createAppError("errors.loadSnapshotFirst");
  }

  const cachedLocation =
    !forceRefresh &&
    state.currentLocation &&
    Date.now() - state.currentLocation.capturedAt <= CURRENT_LOCATION_CACHE_MS
      ? state.currentLocation
      : null;

  const position = cachedLocation || (await requestCurrentLocationPosition({ forceFresh: forceRefresh }));
  const origin = createCurrentLocationOrigin(position);
  const nearestStation = findNearestStation(
    origin,
    state.stations,
    station => station.assetStatus === "active" && station.docks > 0
  );

  if (!nearestStation) {
    throw createAppError("errors.noActiveStationsNearLocation");
  }

  state.currentLocation = {
    ...position,
    nearestStationCode: nearestStation.code,
    nearestStationLabel: nearestStation.label,
  };
  updateCurrentLocationOptionLabel();

  return {
    origin,
    station: nearestStation,
  };
}

async function activateCurrentLocation(
  options: { forceRefresh?: boolean; preserveSelectionOnFailure?: boolean } = {}
) {
  const { forceRefresh = false, preserveSelectionOnFailure = false } = options;
  const previousStartValue = elements.startInput.value;
  if (!preserveSelectionOnFailure || forceRefresh) {
    elements.startInput.value = CURRENT_LOCATION_VALUE;
  }

  state.isResolvingCurrentLocation = true;
  elements.currentLocationButton.textContent = "📍…";
  updatePlannerAvailability();
  showToast(t("toasts.checkingCurrentLocation"));

  try {
    const resolved = await resolveCurrentLocationStart({ forceRefresh });
    elements.startInput.value = CURRENT_LOCATION_VALUE;
    showToast(
      t("toasts.currentLocationResolved", {
        label: resolved.station.label,
      })
    );
    return resolved;
  } catch (error) {
    if (preserveSelectionOnFailure) {
      elements.startInput.value = previousStartValue;
    }
    showToast(getErrorMessage(error), "error");
    throw error;
  } finally {
    state.isResolvingCurrentLocation = false;
    elements.currentLocationButton.textContent = "📍";
    updatePlannerAvailability();
  }
}

async function handleStartSelectionChange() {
  if (elements.startInput.value !== CURRENT_LOCATION_VALUE) return;
  await activateCurrentLocation({ preserveSelectionOnFailure: true });
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return `0 ${t("units.minuteOther")}`;
  if (minutes < 60) return formatMinuteValue(minutes, 1);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes - hours * 60;
  if (remainder < 0.05) return `${hours}${t("units.hour")}`;
  return `${hours}${t("units.hour")} ${formatMinuteValue(remainder, 1)}`;
}

function renderPlan(plan: Plan | null) {
  state.plan = plan;

  elements.pointsValue.textContent = plan ? String(plan.points) : "0";
  elements.ridesValue.textContent = plan ? String(plan.rides) : "0";
  elements.timeValue.textContent = plan ? formatMinutes(plan.totalTravelMinutes) : `0 ${t("units.minuteOther")}`;
  elements.distanceValue.textContent = plan
    ? `${plan.totalDistanceKm.toFixed(1)} ${t("units.kilometer")}`
    : `0 ${t("units.kilometer")}`;

  if (!plan) {
    elements.summaryDetails.innerHTML = `
      <p class="summary-placeholder">
        ${escapeHtml(t("summary.placeholder"))}
      </p>
    `;
    elements.routeList.innerHTML = "";
    drawNetwork();
    return;
  }

  const occupiedNow = state.stations.filter(station => occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD).length;
  const emptyAfterDock = state.stations.filter(station => finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD).length;
  const safeNearestStationLabel = plan.startOrigin ? escapeHtml(plan.startStation.label) : "";
  const safePickupLabel =
    plan.bikePickupStation.code !== plan.startStation.code
      ? escapeHtml(plan.bikePickupStation.label)
      : "";
  const safeStartLabel = escapeHtml(
    plan.startOrigin ? t("controls.currentLocation") : plan.startStation.label
  );
  const safeEndLabel = escapeHtml(plan.endStation.label);
  const nearestStationMarkup = plan.startOrigin
    ? `
      <div>
        <dt>${escapeHtml(t("summary.nearestStation"))}</dt>
        <dd>${safeNearestStationLabel}</dd>
      </div>
    `
    : "";
  const pickupMarkup = plan.bikePickupStation.code !== plan.startStation.code
    ? `
      <div>
        <dt>${escapeHtml(t("summary.bikePickupStation"))}</dt>
        <dd>${safePickupLabel}</dd>
      </div>
    `
    : "";
  const initialWalkingMarkup = plan.totalWalkMinutes > 0
    ? `
      <div>
        <dt>${escapeHtml(t("summary.initialWalking"))}</dt>
        <dd>${formatMinutes(plan.totalWalkMinutes)} · ${plan.totalWalkDistanceKm.toFixed(1)} ${t("units.kilometer")}</dd>
      </div>
    `
    : "";

  elements.summaryDetails.innerHTML = `
    <dl class="summary-breakdown">
      <div>
        <dt>${escapeHtml(t("summary.plannedAt"))}</dt>
        <dd>${formatClockTime(plan.plannedAt)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("summary.finishBy"))}</dt>
        <dd>${formatClockTime(plan.challengeFinishTime)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("summary.minutesRemaining"))}</dt>
        <dd>${formatMinutes(plan.challengeRemainingMinutes)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("summary.start"))}</dt>
        <dd>${safeStartLabel}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("summary.finish"))}</dt>
        <dd>${safeEndLabel}</dd>
      </div>
      ${nearestStationMarkup}
      ${pickupMarkup}
      ${initialWalkingMarkup}
      <div>
        <dt>${escapeHtml(t("summary.bufferAfterRoute"))}</dt>
        <dd>${formatMinutes(plan.remainingBufferMinutes)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("summary.startBonusPoints"))}</dt>
        <dd>${plan.totalStartBonus}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("summary.finishBonusPoints"))}</dt>
        <dd>${plan.totalFinishBonus}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("summary.liveBonusReadyStarts"))}</dt>
        <dd>${occupiedNow}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t("summary.liveBonusReadyFinishes"))}</dt>
        <dd>${emptyAfterDock}</dd>
      </div>
    </dl>
  `;

  elements.routeList.innerHTML = "";
  for (const step of plan.steps) {
    const item = document.createElement("li");
    item.className = "route-item";
    const isWalk = step.type === "walk";
    const pointsText = isWalk ? t("route.walkLeg") : `+${step.points} ${t("units.points")}`;
    const metaLabel = isWalk ? t("route.walkingEstimate") : t("route.travelEstimate");
    const bonusText = isWalk
      ? t("route.manualTransfer")
      : t("route.bonusText", {
          finishBonus: step.finishBonus,
          startBonus: step.startBonus,
        });
    item.innerHTML = `
      <div class="route-item__top">
        <div>
          <span class="route-item__index">${step.sequence}</span>
          <h3 class="route-item__title">${renderStepTitle(step)}</h3>
        </div>
        <span class="route-item__points">${pointsText}</span>
      </div>
      <div class="route-item__meta">
        <div>
          <span>${metaLabel}</span>
          <strong>${formatMinutes(step.travelMinutes)}</strong>
        </div>
        <div>
          <span>${escapeHtml(t("route.distance"))}</span>
          <strong>${step.distanceKm.toFixed(1)} ${t("units.kilometer")}</strong>
        </div>
        <div>
          <span>${escapeHtml(isWalk ? t("route.legType") : t("route.bonusSplit"))}</span>
          <strong>${bonusText}</strong>
        </div>
      </div>
    `;
    elements.routeList.appendChild(item);
  }

  drawNetwork();
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildGoogleMapsUrl(station: Pick<StationLike, "latitude" | "longitude">) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${station.latitude},${station.longitude}`
  )}`;
}

function renderStationLink(station: Pick<StationLike, "label" | "latitude" | "longitude">) {
  return `<a class="route-item__station-link" href="${escapeHtml(buildGoogleMapsUrl(station))}" target="_blank" rel="noopener noreferrer">${escapeHtml(station.label)}</a>`;
}

function renderStepTitle(step: Plan["steps"][number]) {
  const prefix =
    step.type === "walk"
      ? `<span class="route-item__prefix">${escapeHtml(t("route.walkPrefix"))}</span> `
      : "";
  return `${prefix}${renderStationLink(step.from)} <span class="route-item__arrow">→</span> ${renderStationLink(step.to)}`;
}

function drawNetwork() {
  networkMap.drawNetwork({
    currentRoute: state.currentRoute,
    plan: state.plan,
    plannerHidden: elements.plannerPage.hidden,
    stations: state.stations,
  });
}

async function runPlanner() {
  const finishTimeStatus = updatePlannerAvailability();
  if (
    !finishTimeStatus.valid ||
    !("remainingMinutes" in finishTimeStatus) ||
    !("deadline" in finishTimeStatus)
  ) {
    showToast(finishTimeStatus.message, "error");
    return;
  }

  let startStation;
  let startLocationOrigin = null;

  if (elements.startInput.value === CURRENT_LOCATION_VALUE) {
    const resolved = await resolveCurrentLocationStart();
    startStation = resolved.station;
    startLocationOrigin = resolved.origin;
  } else {
    startStation = getSelectedStation(elements.startInput);
  }

  const endStation = getSelectedStation(elements.endInput);

  if (!startStation || !endStation) {
    showToast(t("errors.chooseBothStations"), "error");
    return;
  }

  try {
    const plannedAt = new Date();
    const plan = computeOptimalPlan({
      stations: state.stations,
      startCode: startStation.code,
      startLocationOrigin,
      endCode: endStation.code,
      budgetMinutes: finishTimeStatus.remainingMinutes,
      finishDeadline: finishTimeStatus.deadline,
      detourFactor: Number(elements.detourInput.value),
      plannedAt,
      rideOverheadMinutes: Number(elements.overheadInput.value),
      speedKmh: Number(elements.speedInput.value),
    });

    if (!plan) {
      renderPlan(null);
      showToast(t("toasts.noFeasiblePath"), "error");
      return;
    }

    renderPlan(plan);
    showToast(
      t("toasts.bestRouteFound", {
        points: plan.points,
        rides: plan.rides,
      })
    );
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

elements.loginForm.addEventListener("submit", login);
elements.logoutButton.addEventListener("click", logout);
elements.loadLiveButton.addEventListener("click", loadLiveStations);
elements.demoButton.addEventListener("click", loadDemoStations);
elements.finishTimeInput.addEventListener("input", () => {
  updatePlannerAvailability();
});
elements.currentLocationButton.addEventListener("click", () => {
  activateCurrentLocation({ forceRefresh: true, preserveSelectionOnFailure: true }).catch(() => null);
});
elements.startInput.addEventListener("change", () => {
  handleStartSelectionChange().catch(() => null);
});
elements.languageSelect.addEventListener("change", event => {
  state.language = (event.target as HTMLSelectElement).value;
  applyLanguage({ persist: true });
  renderRoute();
});
elements.planButton.addEventListener("click", () => {
  runPlanner().catch(error => {
    showToast(getErrorMessage(error), "error");
  });
});

window.addEventListener("resize", () => {
  if (state.currentRoute === PLANNER_ROUTE) {
    drawNetwork();
  }
});
window.addEventListener("popstate", () => {
  renderRoute();
});

if (isLocalDevelopmentHost()) {
  elements.demoButton.hidden = false;
}

initializeLanguagePicker();
applyLanguage();
attachRouteLinkHandlers();
renderRoute();
initializeFinishTimeInput();
updatePlannerAvailability();
setInterval(() => {
  updatePlannerAvailability();
}, FINISH_TIME_REFRESH_MS);

hydrateSavedCredentials()
  .catch(() => null)
  .finally(() => {
    syncSession().catch(() => {
      setUser(null);
    });
  });
