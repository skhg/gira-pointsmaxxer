import { fetchAnalyticsStats, sendAnalyticsEvent } from "./analytics.js";
import { computeOptimalPlan } from "./lib/planner.js";
import { CREDITS_ROUTE, PLANNER_ROUTE, STATS_ROUTE } from "./lib/app-routes.js";
import {
  buildDefaultFinishTimeValue,
  FINISH_TIME_REFRESH_MS,
  MINIMUM_REMAINING_MINUTES,
  getFinishTimeStatus as computeFinishTimeStatus,
} from "./lib/finish-time.js";
import {
  SUPPORTED_LANGUAGES,
  detectInitialLanguage,
  getMessages,
  hasTranslation,
  resolveLanguage,
  storeLanguage,
  translate,
} from "./i18n.js";
import { getAppElements } from "./ui/app-elements.js";
import type { AppState } from "./ui/app-state.js";
import { createAuthController } from "./ui/auth-controller.js";
import { createAppRouteController } from "./ui/app-route-controller.js";
import { createCreditsRenderer } from "./ui/credits.js";
import { createCurrentLocationController } from "./ui/current-location-controller.js";
import { createNetworkMapController } from "./ui/network-map.js";
import { createPlannerResultsRenderer } from "./ui/planner-results.js";
import { createStationPanelController } from "./ui/station-panel.js";
import { createStatsRenderer } from "./ui/stats.js";
import type { AppError, AppRoutePath, CreditsSection, Plan, Station } from "./types.js";

const CURRENT_LOCATION_VALUE = "__current_location__";
const CURRENT_LOCATION_ORIGIN_CODE = "__current_location_origin__";
const CURRENT_LOCATION_CACHE_MS = 1000 * 60 * 2;

const state: AppState = {
  currentLocation: null,
  currentRoute: PLANNER_ROUTE,
  language: detectInitialLanguage(),
  source: null,
  fetchedAt: null,
  isResolvingCurrentLocation: false,
  plan: null,
  stats: null,
  stationByCode: new Map(),
  stations: [],
  user: null,
};

const elements = getAppElements();

function getRequiredMetaElement(id: string): HTMLMetaElement {
  const element = document.getElementById(id);
  if (!element || !(element instanceof HTMLMetaElement)) {
    throw new Error(`Missing required meta element #${id}`);
  }

  return element;
}

const shellMetaElements = {
  appleWebAppTitle: getRequiredMetaElement("metaAppleWebAppTitle"),
  applicationName: getRequiredMetaElement("metaApplicationName"),
  description: getRequiredMetaElement("metaDescription"),
  ogDescription: getRequiredMetaElement("metaOgDescription"),
  ogImageAlt: getRequiredMetaElement("metaOgImageAlt"),
  ogSiteName: getRequiredMetaElement("metaOgSiteName"),
  ogTitle: getRequiredMetaElement("metaOgTitle"),
  twitterDescription: getRequiredMetaElement("metaTwitterDescription"),
  twitterImageAlt: getRequiredMetaElement("metaTwitterImageAlt"),
  twitterTitle: getRequiredMetaElement("metaTwitterTitle"),
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
const plannerResults = createPlannerResultsRenderer({
  drawNetwork,
  elements,
  getLocale,
  getStations: () => state.stations,
  onStationLinkOpened: () => {
    trackEvent("google_maps_link_opened");
  },
  translate: t,
});
const {
  formatClockTime,
  formatRemainingTime,
  renderPlan: renderPlannerResults,
} = plannerResults;
function renderPlan(plan: Plan | null) {
  state.plan = plan;
  renderPlannerResults(plan);
}
const stationPanel = createStationPanelController({
  currentLocationValue: CURRENT_LOCATION_VALUE,
  drawNetwork,
  elements,
  getLocale,
  renderPlan,
  state,
  translate: t,
  updatePlannerAvailability,
});
const {
  getSelectedStation,
  renderSnapshotMeta,
  renderStationOptions,
  setStations,
  updateCurrentLocationOptionLabel,
} = stationPanel;
const authController = createAuthController({
  elements,
  getErrorMessage,
  isLocalDevelopmentHost,
  onSignInSuccess: () => {
    trackEvent("sign_in_success");
  },
  onStationsRefreshed: () => {
    trackEvent("stations_refreshed");
  },
  setStations,
  showToast,
  state,
  translate: t,
});
const {
  hydrateSavedCredentials,
  loadDemoStations,
  loadLiveStations,
  login,
  logout,
  setUser,
  syncSession,
} = authController;
const statsRenderer = createStatsRenderer({
  elements,
  getLocale,
  translate: t,
});
const routeController = createAppRouteController({
  afterRender: handleRouteRendered,
  drawNetwork,
  elements,
  hideNetworkTooltip,
  state,
  translate: t,
});
const {
  attachRouteLinkHandlers,
  renderRoute,
  updateDocumentTitle,
} = routeController;
const currentLocationController = createCurrentLocationController({
  currentLocationCacheMs: CURRENT_LOCATION_CACHE_MS,
  currentLocationOriginCode: CURRENT_LOCATION_ORIGIN_CODE,
  currentLocationValue: CURRENT_LOCATION_VALUE,
  elements,
  getErrorMessage,
  onCurrentLocationResolved: () => {
    trackEvent("current_location_used");
  },
  showToast,
  state,
  translate: t,
  updateCurrentLocationOptionLabel,
  updatePlannerAvailability,
});
const {
  activateCurrentLocation,
  handleStartSelectionChange,
  resolveCurrentLocationStart,
} = currentLocationController;

let hasTrackedAppOpen = false;
let lastTrackedRoute: AppRoutePath | null = null;

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

function renderStatsPage() {
  statsRenderer.renderStats(state.stats);
}

function trackEvent(eventName, options: { route?: AppRoutePath } = {}) {
  void sendAnalyticsEvent({
    eventName,
    language: state.language,
    route: options.route || state.currentRoute,
  });
}

async function loadStats() {
  try {
    state.stats = await fetchAnalyticsStats();
  } catch (error) {
    state.stats = null;
    showToast(getErrorMessage(error), "error");
  }

  renderStatsPage();
}

function handleRouteRendered(route: AppRoutePath) {
  if (!hasTrackedAppOpen) {
    hasTrackedAppOpen = true;
    trackEvent("app_open", { route });
  }

  if (lastTrackedRoute !== route) {
    lastTrackedRoute = route;
    trackEvent("page_view", { route });
    if (route === CREDITS_ROUTE) {
      trackEvent("credits_viewed", { route });
    }
    if (route === STATS_ROUTE) {
      trackEvent("stats_viewed", { route });
    }
  }

  if (route === STATS_ROUTE) {
    void loadStats();
  }
}

function applyShellMetadata() {
  const appTitle = t("pageTitle");
  const description = t("shell.description");
  const shareImageAlt = t("shell.shareImageAlt");

  shellMetaElements.description.content = description;
  shellMetaElements.applicationName.content = appTitle;
  shellMetaElements.appleWebAppTitle.content = appTitle;
  shellMetaElements.ogSiteName.content = appTitle;
  shellMetaElements.ogTitle.content = appTitle;
  shellMetaElements.ogDescription.content = description;
  shellMetaElements.ogImageAlt.content = shareImageAlt;
  shellMetaElements.twitterTitle.content = appTitle;
  shellMetaElements.twitterDescription.content = description;
  shellMetaElements.twitterImageAlt.content = shareImageAlt;
}

function applyStaticTranslations() {
  document.documentElement.lang = state.language;
  applyShellMetadata();
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
  elements.rememberEmailLabel.textContent = t("auth.rememberEmail");
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
  elements.footerBrandName.textContent = t("pageTitle");
  elements.footerCreditsLink.textContent = t("credits.footerLink");
  elements.statsHeroEyebrow.textContent = t("stats.heroEyebrow");
  elements.statsHeroTitle.textContent = t("stats.heroTitle");
  elements.statsHeroLede.textContent = t("stats.heroLede");
  elements.statsPanelEyebrow.textContent = t("stats.panelEyebrow");
  elements.statsPanelTitle.textContent = t("stats.panelTitle");
  elements.statsBackToPlannerLink.textContent = t("stats.backToPlanner");
  elements.statsSignedInTitle.textContent = t("stats.signedInTitle");
  elements.statsAnonymousTitle.textContent = t("stats.anonymousTitle");
  elements.statsLanguageTitle.textContent = t("stats.languageTitle");
  elements.statsTopEventsTitle.textContent = t("stats.topEventsTitle");
  elements.footerStatsLink.textContent = t("stats.footerLink");
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
  renderStatsPage();
  updatePlannerAvailability();
}

function hideNetworkTooltip() {
  networkMap.hideTooltip();
}

function isLocalDevelopmentHost() {
  return ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname || "");
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

function drawNetwork() {
  networkMap.drawNetwork({
    currentRoute: state.currentRoute,
    plan: state.plan,
    plannerHidden: Boolean(elements.plannerPage.hidden),
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

  let startStation: Station | null;
  let startLocationOrigin: Station | null = null;

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
    trackEvent("planner_run", { route: PLANNER_ROUTE });
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
  state.language = resolveLanguage((event.target as HTMLSelectElement).value);
  applyLanguage({ persist: true });
  trackEvent("language_selected");
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
