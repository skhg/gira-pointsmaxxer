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
  classifyStation,
  computeOptimalPlan,
  findNearestStation,
  finishBonusRatioAfterDock,
  occupiedRatioNow,
} from "./lib/planner.js";
import {
  SUPPORTED_LANGUAGES,
  detectInitialLanguage,
  getMessages,
  hasTranslation,
  resolveLanguage,
  storeLanguage,
  translate,
} from "./i18n.js";
import { demoStations } from "../testing/fixtures/demo-stations.js";

const MAP_TILE_SIZE = 256;
const MAP_TILE_MAX_COUNT = 36;
const MAP_TILE_MAX_ZOOM = 17;
const MAP_TILE_MIN_ZOOM = 11;
const MAP_TILE_URL_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MERCATOR_MAX_LATITUDE = 85.05112878;
const DEFAULT_CHALLENGE_MINUTES = 120;
const PLANNER_ROUTE = "/";
const CREDITS_ROUTE = "/credits";
const CURRENT_LOCATION_VALUE = "__current_location__";
const CURRENT_LOCATION_ORIGIN_CODE = "__current_location_origin__";
const CURRENT_LOCATION_CACHE_MS = 1000 * 60 * 2;
const FINISH_TIME_STEP_MINUTES = 5;
const FINISH_TIME_REFRESH_MS = 1000 * 30;
const MINIMUM_REMAINING_MINUTES = 5;

const state = {
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
  appFooter: document.getElementById("appFooter"),
  authPanel: document.getElementById("authPanel"),
  authSummary: document.getElementById("authSummary"),
  authSectionTitle: document.getElementById("authSectionTitle"),
  authStepEyebrow: document.getElementById("authStepEyebrow"),
  backToPlannerLink: document.getElementById("backToPlannerLink"),
  creditsHero: document.getElementById("creditsHero"),
  creditsHeroEyebrow: document.getElementById("creditsHeroEyebrow"),
  creditsHeroLede: document.getElementById("creditsHeroLede"),
  creditsHeroTitle: document.getElementById("creditsHeroTitle"),
  creditsPanelEyebrow: document.getElementById("creditsPanelEyebrow"),
  creditsPage: document.getElementById("creditsPage"),
  creditsPanelTitle: document.getElementById("creditsPanelTitle"),
  creditsSections: document.getElementById("creditsSections"),
  controlsSectionTitle: document.getElementById("controlsSectionTitle"),
  controlsStepEyebrow: document.getElementById("controlsStepEyebrow"),
  currentLocationButton: document.getElementById("currentLocationButton"),
  demoButton: document.getElementById("demoButton"),
  detourInput: document.getElementById("detourInput"),
  detourLabel: document.getElementById("detourLabel"),
  distanceValue: document.getElementById("distanceValue"),
  distanceLabel: document.getElementById("distanceLabel"),
  emailInput: document.getElementById("emailInput"),
  emailLabel: document.getElementById("emailLabel"),
  endInput: document.getElementById("endInput"),
  endStationLabel: document.getElementById("endStationLabel"),
  finishTimeLabel: document.getElementById("finishTimeLabel"),
  finishTimeInput: document.getElementById("finishTimeInput"),
  finishTimeNote: document.getElementById("finishTimeNote"),
  footerCreditsLink: document.getElementById("footerCreditsLink"),
  languageLabel: document.getElementById("languageLabel"),
  languageSelect: document.getElementById("languageSelect"),
  legendEmpty: document.getElementById("legendEmpty"),
  legendOccupied: document.getElementById("legendOccupied"),
  legendRoute: document.getElementById("legendRoute"),
  loadLiveButton: document.getElementById("loadLiveButton"),
  loginButton: document.getElementById("loginButton"),
  loginForm: document.getElementById("loginForm"),
  logoutButton: document.getElementById("logoutButton"),
  networkSvg: document.getElementById("networkSvg"),
  networkAttribution: document.getElementById("networkAttribution"),
  networkTooltip: document.getElementById("networkTooltip"),
  networkEyebrow: document.getElementById("networkEyebrow"),
  networkSectionTitle: document.getElementById("networkSectionTitle"),
  overheadInput: document.getElementById("overheadInput"),
  overheadLabel: document.getElementById("overheadLabel"),
  passwordInput: document.getElementById("passwordInput"),
  passwordLabel: document.getElementById("passwordLabel"),
  planButton: document.getElementById("planButton"),
  plannerNote: document.getElementById("plannerNote"),
  plannerEyebrow: document.getElementById("plannerEyebrow"),
  plannerLedeText: document.getElementById("plannerLedeText"),
  plannerTitle: document.getElementById("plannerTitle"),
  plannerWhatIsThisLink: document.getElementById("plannerWhatIsThisLink"),
  pointsValue: document.getElementById("pointsValue"),
  pointsLabel: document.getElementById("pointsLabel"),
  plannerHero: document.getElementById("plannerHero"),
  ridesValue: document.getElementById("ridesValue"),
  ridesLabel: document.getElementById("ridesLabel"),
  plannerPage: document.getElementById("plannerPage"),
  routeLinks: Array.from(document.querySelectorAll("[data-route]")),
  routeEyebrow: document.getElementById("routeEyebrow"),
  routeList: document.getElementById("routeList"),
  routeSectionTitle: document.getElementById("routeSectionTitle"),
  sessionStatus: document.getElementById("sessionStatus"),
  sessionLabel: document.getElementById("sessionLabel"),
  snapshotSource: document.getElementById("snapshotSource"),
  snapshotDisclosureSummary: document.getElementById("snapshotDisclosureSummary"),
  snapshotLabel: document.getElementById("snapshotLabel"),
  speedInput: document.getElementById("speedInput"),
  speedLabel: document.getElementById("speedLabel"),
  startInput: document.getElementById("startInput"),
  startStationLabel: document.getElementById("startStationLabel"),
  stationCount: document.getElementById("stationCount"),
  stationsLabel: document.getElementById("stationsLabel"),
  summaryDetails: document.getElementById("summaryDetails"),
  summarySectionTitle: document.getElementById("summarySectionTitle"),
  summaryStepEyebrow: document.getElementById("summaryStepEyebrow"),
  timeValue: document.getElementById("timeValue"),
  rideTimeLabel: document.getElementById("rideTimeLabel"),
  toast: document.getElementById("toast"),
};

function t(key, values = {}) {
  return translate(state.language, key, values);
}

function hasText(key) {
  return hasTranslation(state.language, key);
}

function getLocale() {
  return getMessages(state.language).locale;
}

function showToast(message, type = "info") {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  elements.toast.dataset.type = type;
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4000);
}

function createAppError(translationKey, values = {}) {
  const error = new Error(translationKey);
  error.translationKey = translationKey;
  error.translationValues = values;
  return error;
}

function getErrorMessage(error) {
  if (error?.translationKey) {
    return t(error.translationKey, error.translationValues);
  }

  if (error?.code && hasText(`errors.${error.code}`)) {
    return t(`errors.${error.code}`);
  }

  return error?.message || t("errors.genericRequest");
}

function formatHtmlString(value) {
  return String(value || "");
}

function renderCreditsSections() {
  const creditsSections = getMessages(state.language).credits.sections;
  elements.creditsSections.innerHTML = "";

  for (const section of creditsSections) {
    const sectionElement = document.createElement("section");
    sectionElement.className = "credits-section";

    let content = `<h3>${escapeHtml(section.title)}</h3>`;

    for (const paragraph of section.paragraphs || []) {
      content += `<p>${escapeHtml(paragraph)}</p>`;
    }

    for (const paragraph of section.paragraphsHtml || []) {
      content += `<p>${formatHtmlString(paragraph)}</p>`;
    }

    if (Array.isArray(section.list) && section.list.length > 0) {
      content += `<ul class="credits-list">${section.list
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
    }

    if (section.note) {
      content += `<p class="credits-note">${escapeHtml(section.note)}</p>`;
    }

    if (section.placeholder) {
      content += `<p class="credits-placeholder">${escapeHtml(section.placeholder)}</p>`;
    }

    sectionElement.innerHTML = content;
    elements.creditsSections.appendChild(sectionElement);
  }
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

function applyLanguage(options = {}) {
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
  elements.networkTooltip.hidden = true;
  delete elements.networkTooltip.dataset.stationCode;
}

function positionNetworkTooltip(position) {
  const tooltip = elements.networkTooltip;
  const stageRect = elements.networkSvg.getBoundingClientRect();
  const tooltipWidth = tooltip.offsetWidth || 220;
  const tooltipHeight = tooltip.offsetHeight || 96;
  const margin = 12;

  const left = Math.min(
    Math.max(position.x + margin, margin),
    Math.max(margin, stageRect.width - tooltipWidth - margin)
  );
  const top = Math.min(
    Math.max(position.y + margin, margin),
    Math.max(margin, stageRect.height - tooltipHeight - margin)
  );

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showNetworkTooltip(station, position) {
  elements.networkTooltip.dataset.stationCode = station.code;
  elements.networkTooltip.innerHTML = `
    <strong>${escapeHtml(station.label)}</strong>
    <div>${escapeHtml(t("network.tooltipOccupied", { bikes: station.bikes, docks: station.docks }))}</div>
    <div>${escapeHtml(
      t("network.tooltipStartBonus", {
        value:
          occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD ? t("network.yes") : t("network.no"),
      })
    )}</div>
    <div>${escapeHtml(
      t("network.tooltipFinishBonus", {
        value:
          finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD
            ? t("network.yes")
            : t("network.no"),
      })
    )}</div>
  `;
  elements.networkTooltip.hidden = false;
  positionNetworkTooltip(position);
}

function isLocalDevelopmentHost() {
  return ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname || "");
}

function normalizeAppPath(pathname = PLANNER_ROUTE) {
  const normalized = String(pathname || PLANNER_ROUTE).replace(/\/+$/u, "") || PLANNER_ROUTE;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function resolveAppRoute(pathname = globalThis.location?.pathname || PLANNER_ROUTE) {
  return normalizeAppPath(pathname) === CREDITS_ROUTE ? CREDITS_ROUTE : PLANNER_ROUTE;
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

function renderRoute(options = {}) {
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
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      navigateToRoute(link.getAttribute("href") || PLANNER_ROUTE);
    });
  }
}

function padTimeNumber(value) {
  return String(value).padStart(2, "0");
}

function formatTimeInputValue(date) {
  return `${padTimeNumber(date.getHours())}:${padTimeNumber(date.getMinutes())}`;
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

function roundUpToStep(date, stepMinutes) {
  const rounded = new Date(date);
  const hadSeconds = rounded.getSeconds() > 0 || rounded.getMilliseconds() > 0;
  rounded.setSeconds(0, 0);

  const remainder = rounded.getMinutes() % stepMinutes;
  if (remainder !== 0 || hadSeconds) {
    const minutesToAdd = remainder === 0 ? stepMinutes : stepMinutes - remainder;
    rounded.setMinutes(rounded.getMinutes() + minutesToAdd);
  }

  return rounded;
}

function getLatestFinishTimeToday(now = new Date()) {
  const latest = new Date(now);
  latest.setHours(23, 55, 0, 0);
  return latest;
}

function initializeFinishTimeInput() {
  if (elements.finishTimeInput.value) return;

  const now = new Date();
  const roundedNow = roundUpToStep(now, FINISH_TIME_STEP_MINUTES);
  const defaultFinish = new Date(roundedNow);
  defaultFinish.setMinutes(defaultFinish.getMinutes() + DEFAULT_CHALLENGE_MINUTES);

  const latestFinish = getLatestFinishTimeToday(now);
  if (defaultFinish > latestFinish) {
    defaultFinish.setTime(latestFinish.getTime());
  }

  elements.finishTimeInput.value = formatTimeInputValue(defaultFinish);
}

function parseFinishTimeValue(value) {
  const match = /^(\d{2}):(\d{2})$/u.exec(String(value || ""));
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return { hours, minutes };
}

function getFinishTimeStatus(now = new Date()) {
  const parsed = parseFinishTimeValue(elements.finishTimeInput.value);
  if (!parsed) {
    return {
      message: t("finishTime.chooseToday"),
      state: "warning",
      valid: false,
    };
  }

  const deadline = new Date(now);
  deadline.setHours(parsed.hours, parsed.minutes, 0, 0);

  const remainingMinutes = (deadline.getTime() - now.getTime()) / 60000;

  if (remainingMinutes <= 0) {
    return {
      deadline,
      message: t("finishTime.passedToday", {
        time: formatClockTime(deadline),
      }),
      remainingMinutes,
      state: "error",
      valid: false,
    };
  }

  if (remainingMinutes < MINIMUM_REMAINING_MINUTES) {
    return {
      deadline,
      message: t("finishTime.tooSoon", {
        minimum: MINIMUM_REMAINING_MINUTES,
        remaining: formatRemainingTime(remainingMinutes),
        time: formatClockTime(deadline),
      }),
      remainingMinutes,
      state: "warning",
      valid: false,
    };
  }

  return {
    deadline,
    message: t("finishTime.remainingUntil", {
      remaining: formatRemainingTime(remainingMinutes),
      time: formatClockTime(deadline),
    }),
    remainingMinutes,
    state: "ok",
    valid: true,
  };
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

function getStationDisplayCode(station) {
  const rawCode = String(station.displayCode || station.shortCode || station.code || "");
  return rawCode.replace(/^0+(?=\d)/, "") || rawCode;
}

function formatStationLabel(station) {
  return `${getStationDisplayCode(station)} - ${station.name.replace(/^\d+\s*-\s*/, "")}`;
}

function setStations(stations, source, fetchedAt) {
  state.stations = stations
    .map(station => ({
      ...station,
      displayCode: getStationDisplayCode(station),
      label: formatStationLabel(station),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, getLocale(), { numeric: true }));

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

  const buildSelect = (selectElement, options = {}) => {
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

function setUser(user) {
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

async function login(event) {
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

function getSelectedStation(inputElement) {
  return state.stationByCode.get(inputElement.value) || null;
}

function createCurrentLocationOrigin(position) {
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

function getCurrentLocationErrorMessage(error) {
  if (error?.code === 1) return t("errors.locationPermissionDenied");
  if (error?.code === 2) return t("errors.locationUnavailable");
  if (error?.code === 3) return t("errors.locationTimeout");
  return error?.message || t("errors.currentLocationUnavailable");
}

async function requestCurrentLocationPosition(options = {}) {
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

  return new Promise((resolve, reject) => {
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

async function resolveCurrentLocationStart(options = {}) {
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

async function activateCurrentLocation(options = {}) {
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

function renderPlan(plan) {
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

function buildBounds(stations) {
  if (stations.length === 0) return null;

  return stations.reduce(
    (acc, station) => ({
      minLat: Math.min(acc.minLat, station.latitude),
      maxLat: Math.max(acc.maxLat, station.latitude),
      minLng: Math.min(acc.minLng, station.longitude),
      maxLng: Math.max(acc.maxLng, station.longitude),
    }),
    {
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
    }
  );
}

function clampLatitude(latitude) {
  return Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, latitude));
}

function mercatorXFromLongitude(longitude) {
  return (longitude + 180) / 360;
}

function mercatorYFromLatitude(latitude) {
  const clampedLatitude = clampLatitude(latitude);
  const radians = (clampedLatitude * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

function chooseMapTileZoom(mercatorSpanX, mercatorSpanY, viewportWidth, viewportHeight) {
  const normalizedLngSpan = Math.max(mercatorSpanX, 1e-6);
  const normalizedLatSpan = Math.max(mercatorSpanY, 1e-6);
  const zoomForWidth = Math.log2(viewportWidth / (MAP_TILE_SIZE * normalizedLngSpan));
  const zoomForHeight = Math.log2(viewportHeight / (MAP_TILE_SIZE * normalizedLatSpan));
  const idealZoom = Math.min(zoomForWidth, zoomForHeight);

  if (!Number.isFinite(idealZoom)) return MAP_TILE_MIN_ZOOM;
  return Math.max(MAP_TILE_MIN_ZOOM, Math.min(MAP_TILE_MAX_ZOOM, Math.ceil(idealZoom)));
}

function buildMapTileUrl(zoom, x, y) {
  return MAP_TILE_URL_TEMPLATE
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

function buildProjectionViewport(bounds, width, height, padding) {
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const minMercatorX = mercatorXFromLongitude(bounds.minLng);
  const maxMercatorX = mercatorXFromLongitude(bounds.maxLng);
  const minMercatorY = mercatorYFromLatitude(bounds.maxLat);
  const maxMercatorY = mercatorYFromLatitude(bounds.minLat);
  const mercatorSpanX = Math.max(maxMercatorX - minMercatorX, 1e-6);
  const mercatorSpanY = Math.max(maxMercatorY - minMercatorY, 1e-6);
  const scale = Math.min(usableWidth / mercatorSpanX, usableHeight / mercatorSpanY);
  const contentWidth = mercatorSpanX * scale;
  const contentHeight = mercatorSpanY * scale;
  const originX = padding + (usableWidth - contentWidth) / 2;
  const originY = padding + (usableHeight - contentHeight) / 2;

  return {
    contentHeight,
    contentWidth,
    maxMercatorX,
    maxMercatorY,
    mercatorSpanX,
    mercatorSpanY,
    minMercatorX,
    minMercatorY,
    originX,
    originY,
    scale,
  };
}

function buildMapTileDescriptors(viewport) {
  let zoom = chooseMapTileZoom(
    viewport.mercatorSpanX,
    viewport.mercatorSpanY,
    viewport.contentWidth,
    viewport.contentHeight
  );
  let descriptors = [];

  while (zoom >= MAP_TILE_MIN_ZOOM) {
    const tileScale = 2 ** zoom;
    const tileMinX = Math.floor(viewport.minMercatorX * tileScale);
    const tileMaxX = Math.ceil(viewport.maxMercatorX * tileScale) - 1;
    const tileMinY = Math.floor(viewport.minMercatorY * tileScale);
    const tileMaxY = Math.ceil(viewport.maxMercatorY * tileScale) - 1;
    const tileColumns = tileMaxX - tileMinX + 1;
    const tileRows = tileMaxY - tileMinY + 1;

    if (tileColumns * tileRows <= MAP_TILE_MAX_COUNT || zoom === MAP_TILE_MIN_ZOOM) {
      descriptors = [];
      for (let tileX = tileMinX; tileX <= tileMaxX; tileX += 1) {
        for (let tileY = tileMinY; tileY <= tileMaxY; tileY += 1) {
          if (tileY < 0 || tileY >= tileScale || tileX < 0 || tileX >= tileScale) continue;

          descriptors.push({
            href: buildMapTileUrl(zoom, tileX, tileY),
            height: viewport.scale / tileScale,
            width: viewport.scale / tileScale,
            x: viewport.originX + (tileX / tileScale - viewport.minMercatorX) * viewport.scale,
            y: viewport.originY + (tileY / tileScale - viewport.minMercatorY) * viewport.scale,
          });
        }
      }

      break;
    }

    zoom -= 1;
  }

  return descriptors;
}

function expandBounds(bounds, options = {}) {
  const {
    minLatSpan = 0.01,
    minLngSpan = 0.015,
    paddingRatio = 0.22,
  } = options;

  const latCenter = (bounds.minLat + bounds.maxLat) / 2;
  const lngCenter = (bounds.minLng + bounds.maxLng) / 2;
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, minLatSpan);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, minLngSpan);
  const paddedLatSpan = latSpan * (1 + paddingRatio);
  const paddedLngSpan = lngSpan * (1 + paddingRatio);

  return {
    minLat: latCenter - paddedLatSpan / 2,
    maxLat: latCenter + paddedLatSpan / 2,
    minLng: lngCenter - paddedLngSpan / 2,
    maxLng: lngCenter + paddedLngSpan / 2,
  };
}

function stationIsInsideBounds(station, bounds) {
  return (
    station.latitude >= bounds.minLat &&
    station.latitude <= bounds.maxLat &&
    station.longitude >= bounds.minLng &&
    station.longitude <= bounds.maxLng
  );
}

function getFocusStations() {
  if (!state.plan) return state.stations;

  const seenCodes = new Set();
  const focused = [];

  const addStation = station => {
    if (!station || seenCodes.has(station.code)) return;
    seenCodes.add(station.code);
    focused.push(station);
  };

  addStation(state.plan.startOrigin);
  addStation(state.plan.startStation);
  addStation(state.plan.endStation);

  for (const leg of state.plan.walkSteps ?? []) {
    addStation(leg.from);
    addStation(leg.to);
  }

  for (const leg of state.plan.route ?? []) {
    addStation(leg.from);
    addStation(leg.to);
  }

  return focused.length > 0 ? focused : state.stations;
}

function projectStations(stations, focusStations = stations) {
  if (stations.length === 0) {
    return {
      bounds: null,
      projected: new Map(),
      visibleStations: [],
    };
  }

  const rawBounds = buildBounds(focusStations) || buildBounds(stations);
  const bounds = expandBounds(rawBounds);

  const width = 1000;
  const height = 700;
  const padding = 70;
  const viewport = buildProjectionViewport(bounds, width, height, padding);

  const projected = new Map();
  const projectionSources = [...stations];

  for (const station of focusStations) {
    if (!station || projectionSources.some(entry => entry.code === station.code)) continue;
    projectionSources.push(station);
  }

  for (const station of projectionSources) {
    const x =
      viewport.originX +
      (mercatorXFromLongitude(station.longitude) - viewport.minMercatorX) * viewport.scale;
    const y =
      viewport.originY +
      (mercatorYFromLatitude(station.latitude) - viewport.minMercatorY) * viewport.scale;
    projected.set(station.code, { x, y });
  }

  const visibleStations = stations.filter(station => stationIsInsideBounds(station, bounds));

  return {
    bounds,
    projected,
    viewport,
    visibleStations,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildGoogleMapsUrl(station) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${station.latitude},${station.longitude}`
  )}`;
}

function renderStationLink(station) {
  return `<a class="route-item__station-link" href="${escapeHtml(buildGoogleMapsUrl(station))}" target="_blank" rel="noopener noreferrer">${escapeHtml(station.label)}</a>`;
}

function renderStepTitle(step) {
  const prefix =
    step.type === "walk"
      ? `<span class="route-item__prefix">${escapeHtml(t("route.walkPrefix"))}</span> `
      : "";
  return `${prefix}${renderStationLink(step.from)} <span class="route-item__arrow">→</span> ${renderStationLink(step.to)}`;
}

function drawNetwork() {
  if (state.currentRoute !== PLANNER_ROUTE || elements.plannerPage.hidden) {
    return;
  }

  const svg = elements.networkSvg;
  const stations = state.stations;
  const focusStations = getFocusStations();
  const { bounds, projected, viewport, visibleStations } = projectStations(stations, focusStations);
  const viewBox = svg.viewBox.baseVal;
  const viewBoxWidth = viewBox?.width || 1000;
  const viewBoxHeight = viewBox?.height || 700;

  svg.innerHTML = "";
  hideNetworkTooltip();

  svg.onclick = () => {
    hideNetworkTooltip();
  };

  if (bounds) {
    const clipId = `network-map-clip-${state.plan ? "focused" : "all"}`;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clipPath.setAttribute("id", clipId);

    const clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    clipRect.setAttribute("x", String(viewport.originX));
    clipRect.setAttribute("y", String(viewport.originY));
    clipRect.setAttribute("width", String(viewport.contentWidth));
    clipRect.setAttribute("height", String(viewport.contentHeight));
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    const mapGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    mapGroup.setAttribute("clip-path", `url(#${clipId})`);

    for (const tile of buildMapTileDescriptors(viewport)) {
      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      image.setAttribute("x", String(tile.x));
      image.setAttribute("y", String(tile.y));
      image.setAttribute("width", String(tile.width));
      image.setAttribute("height", String(tile.height));
      image.setAttribute("preserveAspectRatio", "none");
      image.setAttribute("opacity", "0.9");
      image.setAttribute("href", tile.href);
      mapGroup.appendChild(image);
    }

    const wash = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    wash.setAttribute("x", String(viewport.originX));
    wash.setAttribute("y", String(viewport.originY));
    wash.setAttribute("width", String(viewport.contentWidth));
    wash.setAttribute("height", String(viewport.contentHeight));
    wash.setAttribute("fill", "rgba(255, 251, 244, 0.2)");
    mapGroup.appendChild(wash);

    svg.appendChild(mapGroup);

    const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    frame.setAttribute("x", String(viewport.originX));
    frame.setAttribute("y", String(viewport.originY));
    frame.setAttribute("width", String(viewport.contentWidth));
    frame.setAttribute("height", String(viewport.contentHeight));
    frame.setAttribute("rx", "22");
    frame.setAttribute("fill", "none");
    frame.setAttribute("stroke", "rgba(255,255,255,0.45)");
    frame.setAttribute("stroke-width", "2");
    svg.appendChild(frame);
  }

  const projectionLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  projectionLabel.setAttribute("x", "32");
  projectionLabel.setAttribute("y", "42");
  projectionLabel.setAttribute("fill", "rgba(23, 35, 20, 0.5)");
  projectionLabel.setAttribute("font-family", "IBM Plex Mono, monospace");
  projectionLabel.setAttribute("font-size", "14");
  projectionLabel.textContent = state.plan
    ? t("network.zoomedLabel")
    : t("network.projectedLabel");
  svg.appendChild(projectionLabel);

  if (state.plan?.route?.length) {
    const lineGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const points = [
      state.plan.route[0].from,
      ...state.plan.route.map(leg => leg.to),
    ]
      .map(station => projected.get(station.code))
      .filter(Boolean)
      .map(point => `${point.x},${point.y}`)
      .join(" ");

    const routeShadow = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    routeShadow.setAttribute("points", points);
    routeShadow.setAttribute("fill", "none");
    routeShadow.setAttribute("stroke", "rgba(13, 77, 57, 0.16)");
    routeShadow.setAttribute("stroke-width", "18");
    routeShadow.setAttribute("stroke-linecap", "round");
    routeShadow.setAttribute("stroke-linejoin", "round");
    lineGroup.appendChild(routeShadow);

    const routeLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    routeLine.setAttribute("points", points);
    routeLine.setAttribute("fill", "none");
    routeLine.setAttribute("stroke", "var(--route)");
    routeLine.setAttribute("stroke-width", "6");
    routeLine.setAttribute("stroke-linecap", "round");
    routeLine.setAttribute("stroke-linejoin", "round");
    lineGroup.appendChild(routeLine);

    svg.appendChild(lineGroup);
  }

  if (state.plan?.walkSteps?.length) {
    for (const walkStep of state.plan.walkSteps) {
      const walkPoints = [walkStep.from, walkStep.to]
        .map(station => projected.get(station.code))
        .filter(Boolean)
        .map(point => `${point.x},${point.y}`)
        .join(" ");

      if (!walkPoints) continue;

      const walkLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      walkLine.setAttribute("points", walkPoints);
      walkLine.setAttribute("fill", "none");
      walkLine.setAttribute("stroke", "rgba(217, 119, 6, 0.9)");
      walkLine.setAttribute("stroke-width", "4");
      walkLine.setAttribute("stroke-linecap", "round");
      walkLine.setAttribute("stroke-linejoin", "round");
      walkLine.setAttribute("stroke-dasharray", "12 10");
      svg.appendChild(walkLine);
    }
  }

  if (state.plan?.startOrigin) {
    const point = projected.get(state.plan.startOrigin.code);
    if (point) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", String(point.x));
      ring.setAttribute("cy", String(point.y));
      ring.setAttribute("r", "11");
      ring.setAttribute("fill", "rgba(255,255,255,0.85)");
      ring.setAttribute("stroke", "rgba(37, 99, 235, 0.28)");
      ring.setAttribute("stroke-width", "3");
      svg.appendChild(ring);

      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(point.x));
      dot.setAttribute("cy", String(point.y));
      dot.setAttribute("r", "5.5");
      dot.setAttribute("fill", "rgba(37, 99, 235, 0.95)");
      svg.appendChild(dot);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(point.x + 14));
      label.setAttribute("y", String(point.y - 12));
      label.setAttribute("fill", "rgba(37, 99, 235, 0.92)");
      label.setAttribute("font-family", "IBM Plex Mono, monospace");
      label.setAttribute("font-size", "12");
      label.textContent = t("network.you");
      svg.appendChild(label);
    }
  }

  const routeCodes = new Set();
  if (state.plan) {
    routeCodes.add(state.plan.startStation.code);
    routeCodes.add(state.plan.endStation.code);
  }
  if (state.plan?.route?.length) {
    routeCodes.add(state.plan.route[0].from.code);
    for (const leg of state.plan.route) routeCodes.add(leg.to.code);
  }

  visibleStations.forEach(station => {
    const point = projected.get(station.code);
    if (!point) return;

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    const category = classifyStation(station);
    const isInRoute = routeCodes.has(station.code);
    const fill =
      category === "occupied"
        ? "var(--occupied)"
        : category === "empty"
          ? "var(--empty)"
          : "var(--neutral)";

    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", String(point.x));
    ring.setAttribute("cy", String(point.y));
    ring.setAttribute("r", isInRoute ? "13" : "10");
    ring.setAttribute("fill", "rgba(255,255,255,0.85)");
    ring.setAttribute("stroke", isInRoute ? "rgba(13, 77, 57, 0.28)" : "rgba(23, 35, 20, 0.1)");
    ring.setAttribute("stroke-width", isInRoute ? "4" : "2");
    group.appendChild(ring);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(point.x));
    dot.setAttribute("cy", String(point.y));
    dot.setAttribute("r", isInRoute ? "8" : "6.5");
    dot.setAttribute("fill", fill);
    group.appendChild(dot);

    if (isInRoute) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(point.x + 14));
      label.setAttribute("y", String(point.y - 12));
      label.setAttribute("fill", "rgba(23, 35, 20, 0.88)");
      label.setAttribute("font-family", "IBM Plex Mono, monospace");
      label.setAttribute("font-size", "12");
      label.textContent = station.displayCode;
      group.appendChild(label);
    }

    const fixedTooltipPosition = {
      x: (point.x / viewBoxWidth) * svg.clientWidth,
      y: (point.y / viewBoxHeight) * svg.clientHeight,
    };

    group.addEventListener("mousemove", event => {
      showNetworkTooltip(station, {
        x: event.offsetX,
        y: event.offsetY,
      });
    });

    group.addEventListener("mouseleave", () => {
      hideNetworkTooltip();
    });

    group.addEventListener("click", event => {
      event.stopPropagation();
      const isSameStationOpen =
        !elements.networkTooltip.hidden &&
        elements.networkTooltip.dataset.stationCode === station.code;

      if (isSameStationOpen) {
        hideNetworkTooltip();
        return;
      }

      showNetworkTooltip(station, fixedTooltipPosition);
    });

    group.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      showNetworkTooltip(station, fixedTooltipPosition);
    });

    svg.appendChild(group);
  });
}

async function runPlanner() {
  const finishTimeStatus = updatePlannerAvailability();
  if (!finishTimeStatus.valid) {
    showToast(finishTimeStatus.message, "error");
    return;
  }

  let startStation = null;
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
  state.language = event.target.value;
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
