import {
  clearSavedCredentials,
  getRuntimeLabel,
  getSessionSummary,
  isNativeRuntime,
  loadSavedCredentials,
  loadLiveSnapshot,
  loginWithGira,
  logoutFromGira,
  saveCredentials,
} from "./gira-client.js";

const RESOLUTION_SECONDS = 30;
const DEFAULT_OCCUPIED_THRESHOLD = 0.7;
const DEFAULT_EMPTY_THRESHOLD = 0.7;
const DEFAULT_WALKING_SPEED_KMH = 4.8;
const DEFAULT_WALKING_DETOUR_FACTOR = 1.12;
const CURRENT_LOCATION_VALUE = "__current_location__";
const CURRENT_LOCATION_ORIGIN_CODE = "__current_location_origin__";
const CURRENT_LOCATION_CACHE_MS = 1000 * 60 * 2;

const demoStations = [
  { code: "104", name: "104 - Gare do Oriente", latitude: 38.766716, longitude: -9.097322, bikes: 18, docks: 20, serialNumber: "demo-104", assetStatus: "active" },
  { code: "105", name: "105 - CC Vasco da Gama", latitude: 38.768548, longitude: -9.096222, bikes: 5, docks: 20, serialNumber: "demo-105", assetStatus: "active" },
  { code: "106", name: "106 - Jardim Garcia da Orta", latitude: 38.769459, longitude: -9.092506, bikes: 4, docks: 20, serialNumber: "demo-106", assetStatus: "active" },
  { code: "107", name: "107 - Rotunda dos Vice-Reis", latitude: 38.774505, longitude: -9.095416, bikes: 17, docks: 22, serialNumber: "demo-107", assetStatus: "active" },
  { code: "108", name: "108 - Rua do Bojador", latitude: 38.774289, longitude: -9.09235, bikes: 6, docks: 20, serialNumber: "demo-108", assetStatus: "active" },
  { code: "110", name: "110 - Rua de Moscavide", latitude: 38.778466, longitude: -9.097068, bikes: 19, docks: 22, serialNumber: "demo-110", assetStatus: "active" },
  { code: "414", name: "414 - Av. Duque de Avila / Rua Pinheiro Chagas", latitude: 38.735, longitude: -9.151, bikes: 16, docks: 20, serialNumber: "demo-414", assetStatus: "active" },
  { code: "431", name: "431 - Rua do Arco Cego / Av. Magalhaes Lima", latitude: 38.73937, longitude: -9.14199, bikes: 5, docks: 18, serialNumber: "demo-431", assetStatus: "active" },
  { code: "452", name: "452 - Rua Teixeira de Pascoais / Rua Dr. Gama Barros", latitude: 38.747751, longitude: -9.136681, bikes: 3, docks: 22, serialNumber: "demo-452", assetStatus: "active" },
  { code: "457", name: "457 - Rua Aboim Ascensao", latitude: 38.74975, longitude: -9.14722, bikes: 15, docks: 20, serialNumber: "demo-457", assetStatus: "active" },
  { code: "464", name: "464 - Av. da Igreja / Rua Afonso Lopes Vieira", latitude: 38.75165, longitude: -9.148427, bikes: 4, docks: 20, serialNumber: "demo-464", assetStatus: "active" },
  { code: "481", name: "481 - Campo Grande / Museu da Cidade", latitude: 38.758207, longitude: -9.156169, bikes: 17, docks: 20, serialNumber: "demo-481", assetStatus: "active" }
];

const state = {
  currentLocation: null,
  source: null,
  fetchedAt: null,
  plan: null,
  stationByCode: new Map(),
  stations: [],
  user: null,
};

const elements = {
  authSummary: document.getElementById("authSummary"),
  budgetInput: document.getElementById("budgetInput"),
  demoButton: document.getElementById("demoButton"),
  detourInput: document.getElementById("detourInput"),
  distanceValue: document.getElementById("distanceValue"),
  emailInput: document.getElementById("emailInput"),
  endInput: document.getElementById("endInput"),
  loadLiveButton: document.getElementById("loadLiveButton"),
  loginButton: document.getElementById("loginButton"),
  loginForm: document.getElementById("loginForm"),
  logoutButton: document.getElementById("logoutButton"),
  networkSvg: document.getElementById("networkSvg"),
  networkTooltip: document.getElementById("networkTooltip"),
  overheadInput: document.getElementById("overheadInput"),
  passwordInput: document.getElementById("passwordInput"),
  planButton: document.getElementById("planButton"),
  plannerNote: document.getElementById("plannerNote"),
  pointsValue: document.getElementById("pointsValue"),
  ridesValue: document.getElementById("ridesValue"),
  routeList: document.getElementById("routeList"),
  sessionStatus: document.getElementById("sessionStatus"),
  snapshotSource: document.getElementById("snapshotSource"),
  speedInput: document.getElementById("speedInput"),
  startInput: document.getElementById("startInput"),
  stationCount: document.getElementById("stationCount"),
  summaryDetails: document.getElementById("summaryDetails"),
  timeValue: document.getElementById("timeValue"),
  toast: document.getElementById("toast"),
};

function showToast(message, type = "info") {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  elements.toast.dataset.type = type;
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4000);
}

function getStationDisplayCode(station) {
  const rawCode = String(station.displayCode || station.shortCode || station.code || "");
  return rawCode.replace(/^0+(?=\d)/, "") || rawCode;
}

function formatStationLabel(station) {
  return `${getStationDisplayCode(station)} - ${station.name.replace(/^\d+\s*-\s*/, "")}`;
}

function occupiedRatioNow(station) {
  return station.docks > 0 ? station.bikes / station.docks : 0;
}

function finishBonusRatioAfterDock(station) {
  if (station.docks <= 0 || station.bikes >= station.docks) return -Infinity;
  return (station.docks - (station.bikes + 1)) / station.docks;
}

function classifyStation(station) {
  const canStartBonus = occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD;
  const canFinishBonus = finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD;
  if (canStartBonus) return "occupied";
  if (canFinishBonus) return "empty";
  return "neutral";
}

function setStations(stations, source, fetchedAt) {
  state.stations = stations
    .map(station => ({
      ...station,
      displayCode: getStationDisplayCode(station),
      label: formatStationLabel(station),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "en", { numeric: true }));

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
    ? `${state.source === "live" ? "Live Gira" : "Demo"}${state.fetchedAt ? ` · ${new Date(state.fetchedAt).toLocaleTimeString()}` : ""}`
    : "None loaded";
  elements.stationCount.textContent = String(state.stations.length);
  elements.planButton.disabled = state.stations.length === 0;
}

function renderStationOptions() {
  const previousStartValue = elements.startInput.value;
  const previousEndValue = elements.endInput.value;

  const buildSelect = (selectElement, options = {}) => {
    const { includeCurrentLocation = false } = options;
    selectElement.innerHTML = "";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Choose a station";
    selectElement.appendChild(placeholderOption);

    if (includeCurrentLocation) {
      const currentLocationOption = document.createElement("option");
      currentLocationOption.value = CURRENT_LOCATION_VALUE;
      currentLocationOption.textContent = state.currentLocation?.nearestStationLabel
        ? `Current location · nearest ${state.currentLocation.nearestStationLabel}`
        : "Current location";
      selectElement.appendChild(currentLocationOption);
    }

    for (const station of state.stations) {
      const option = document.createElement("option");
      option.value = station.code;
      option.textContent = `${station.label} · ${station.bikes}/${station.docks} bikes`;
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
  elements.sessionStatus.textContent = authenticated ? user.name || user.email || "Signed in" : "Signed out";
  elements.logoutButton.hidden = !authenticated;
  elements.loadLiveButton.disabled = !authenticated;
  elements.loginButton.disabled = false;
  elements.authSummary.textContent = authenticated
    ? isNativeRuntime()
      ? `Signed in as ${user.name || user.email}. Live snapshots are fetched directly on ${getRuntimeLabel()}, and the saved sign-in stays on this device until you log out.`
      : `Signed in as ${user.name || user.email}. Live snapshots stay server-side on this local app instance, and the saved sign-in stays on this browser until you log out.`
    : isNativeRuntime()
      ? "Live mode signs in directly on this device and can remember your sign-in between refreshes until you log out."
      : "Live mode uses your own Gira account and can remember your sign-in in this browser between refreshes until you log out.";
}

async function syncSession() {
  const data = await getSessionSummary();
  setUser(data.authenticated ? data.user : null);
}

async function hydrateSavedCredentials() {
  const savedCredentials = await loadSavedCredentials().catch(() => null);
  if (!savedCredentials) return;

  elements.emailInput.value = savedCredentials.email;
  elements.passwordInput.value = savedCredentials.password;
}

async function login(event) {
  event.preventDefault();
  elements.loginButton.disabled = true;
  elements.loginButton.textContent = "Signing in...";

  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;

  try {
    const data = await loginWithGira(email, password);
    await saveCredentials(email, password).catch(() => null);

    setUser(data.user);
    showToast("Signed in. Loading the latest Gira snapshot...");
    await loadLiveStations();
  } catch (error) {
    showToast(error.message, "error");
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = "Sign in to Gira";
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
  elements.loginButton.textContent = "Sign in to Gira";
  showToast("Signed out and cleared the saved sign-in.");
}

async function loadLiveStations() {
  elements.loadLiveButton.disabled = true;
  elements.loadLiveButton.textContent = "Refreshing...";

  try {
    const data = await loadLiveSnapshot();
    setStations(data.stations, data.source, data.fetchedAt);
    setUser(data.user || state.user);
    showToast(`Loaded ${data.stationCount} live stations.`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    elements.loadLiveButton.disabled = !state.user;
    elements.loadLiveButton.textContent = "Refresh live stations";
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = "Sign in to Gira";
  }
}

function loadDemoStations() {
  setStations(demoStations, "demo", new Date().toISOString());
  showToast("Loaded the bundled demo snapshot.");
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
    label: "Current location",
    latitude: Number(position.latitude),
    longitude: Number(position.longitude),
    name: "Current location",
    serialNumber: CURRENT_LOCATION_ORIGIN_CODE,
  };
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

function estimateWalkLeg(from, to, detourFactor) {
  const distanceKm = haversineKm(from, to) * Math.max(DEFAULT_WALKING_DETOUR_FACTOR, detourFactor);
  const walkMinutes = (distanceKm / DEFAULT_WALKING_SPEED_KMH) * 60;
  const slots = Math.max(1, Math.ceil((walkMinutes * 60) / RESOLUTION_SECONDS));

  return {
    distanceKm,
    from,
    points: 0,
    sequence: 1,
    slots,
    title: `Walk: ${from.label} → ${to.label}`,
    to,
    travelMinutes: walkMinutes,
    type: "walk",
  };
}

function findNearestStation(fromPoint, stations, predicate = () => true) {
  let nearest = null;

  for (const station of stations) {
    if (!predicate(station)) continue;

    const distanceKm = haversineKm(fromPoint, station);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = {
        distanceKm,
        station,
      };
    }
  }

  return nearest?.station || null;
}

function findNearestAvailableBikeStation(startStation, stations) {
  return findNearestStation(
    startStation,
    stations,
    station =>
      station.code !== startStation.code &&
      station.assetStatus === "active" &&
      station.bikes > 0 &&
      station.docks > 0
  );
}

function getCurrentLocationErrorMessage(error) {
  if (error?.code === 1) return "Location permission was denied for this app.";
  if (error?.code === 2) return "The device could not determine the current location.";
  if (error?.code === 3) return "Timed out while requesting the current GPS position.";
  return error?.message || "Could not determine the current location.";
}

async function requestCurrentLocationPosition() {
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
    throw new Error("This browser or device does not expose GPS location.");
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
        maximumAge: CURRENT_LOCATION_CACHE_MS,
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
    ? `Current location · nearest ${state.currentLocation.nearestStationLabel}`
    : "Current location";
}

async function resolveCurrentLocationStart() {
  if (state.stations.length === 0) {
    throw new Error("Load a station snapshot before using Current Location.");
  }

  const cachedLocation =
    state.currentLocation &&
    Date.now() - state.currentLocation.capturedAt <= CURRENT_LOCATION_CACHE_MS
      ? state.currentLocation
      : null;

  const position = cachedLocation || (await requestCurrentLocationPosition());
  const origin = createCurrentLocationOrigin(position);
  const nearestStation = findNearestStation(
    origin,
    state.stations,
    station => station.assetStatus === "active" && station.docks > 0
  );

  if (!nearestStation) {
    throw new Error("No active Gira stations are available near the current location.");
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

async function handleStartSelectionChange() {
  if (elements.startInput.value !== CURRENT_LOCATION_VALUE) return;

  showToast("Checking your current location...");

  try {
    const resolved = await resolveCurrentLocationStart();
    showToast(`Current location resolved to ${resolved.station.label}.`);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function computeOptimalPlan(config) {
  const {
    stations,
    startCode,
    endCode,
    budgetMinutes,
    speedKmh,
    detourFactor,
    rideOverheadMinutes,
    startLocationOrigin = null,
  } = config;

  const startIndex = stations.findIndex(station => station.code === startCode);
  const endIndex = stations.findIndex(station => station.code === endCode);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error("Pick both a valid start and finish station.");
  }

  if (speedKmh <= 0 || detourFactor < 1 || budgetMinutes <= 0) {
    throw new Error("The speed, detour factor, and time budget must all be positive.");
  }

  const maxSlots = Math.floor((budgetMinutes * 60) / RESOLUTION_SECONDS);
  if (maxSlots <= 0) throw new Error("The time budget is too small for the current planner resolution.");

  const chosenStartStation = stations[startIndex];
  let rideStartIndex = startIndex;
  const preRideSteps = [];

  if (startLocationOrigin) {
    preRideSteps.push(estimateWalkLeg(startLocationOrigin, chosenStartStation, detourFactor));
  }

  if (chosenStartStation.bikes <= 0) {
    const nearestBikeStation = findNearestAvailableBikeStation(chosenStartStation, stations);
    if (!nearestBikeStation) {
      throw new Error("The selected start station has no bikes, and no other active station currently has an available bike.");
    }

    rideStartIndex = stations.findIndex(station => station.code === nearestBikeStation.code);
    preRideSteps.push(estimateWalkLeg(chosenStartStation, nearestBikeStation, detourFactor));
  }

  const initialSlot = preRideSteps.reduce((sum, step) => sum + step.slots, 0);
  if (initialSlot > maxSlots) {
    return null;
  }

  const edges = Array.from({ length: stations.length }, () => []);

  for (let fromIndex = 0; fromIndex < stations.length; fromIndex += 1) {
    const from = stations[fromIndex];
    if (from.assetStatus !== "active" || from.docks <= 0) continue;

    const originBikes = from.bikes + (fromIndex === rideStartIndex ? 0 : 1);
    if (originBikes < 1) continue;

    for (let toIndex = 0; toIndex < stations.length; toIndex += 1) {
      if (fromIndex === toIndex) continue;

      const to = stations[toIndex];
      if (to.assetStatus !== "active" || to.docks <= 0) continue;

      const destinationPreArrivalBikes =
        to.bikes - (toIndex === rideStartIndex && fromIndex !== rideStartIndex ? 1 : 0);

      if (destinationPreArrivalBikes < 0 || destinationPreArrivalBikes >= to.docks) {
        continue;
      }

      const distanceKm = haversineKm(from, to) * detourFactor;
      const rideMinutes = (distanceKm / speedKmh) * 60 + rideOverheadMinutes;
      const slots = Math.max(1, Math.ceil((rideMinutes * 60) / RESOLUTION_SECONDS));
      const startBonus = originBikes / from.docks > DEFAULT_OCCUPIED_THRESHOLD ? 100 : 0;
      const finishBonus =
        (to.docks - (destinationPreArrivalBikes + 1)) / to.docks > DEFAULT_EMPTY_THRESHOLD
          ? 100
          : 0;

      edges[fromIndex].push({
        fromIndex,
        toIndex,
        distanceKm,
        finishBonus,
        points: 10 + startBonus + finishBonus,
        rideMinutes,
        slots,
        startBonus,
      });
    }
  }

  const bestScore = Array.from({ length: maxSlots + 1 }, () =>
    Array(stations.length).fill(Number.NEGATIVE_INFINITY)
  );
  const bestExactMinutes = Array.from({ length: maxSlots + 1 }, () =>
    Array(stations.length).fill(Number.POSITIVE_INFINITY)
  );
  const previous = Array.from({ length: maxSlots + 1 }, () =>
    Array(stations.length).fill(null)
  );

  const initialExactMinutes = preRideSteps.reduce((sum, step) => sum + step.travelMinutes, 0);

  bestScore[initialSlot][rideStartIndex] = 0;
  bestExactMinutes[initialSlot][rideStartIndex] = initialExactMinutes;

  for (let timeSlot = 0; timeSlot <= maxSlots; timeSlot += 1) {
    for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
      const currentScore = bestScore[timeSlot][stationIndex];
      if (!Number.isFinite(currentScore)) continue;

      for (const edge of edges[stationIndex]) {
        const nextSlot = timeSlot + edge.slots;
        if (nextSlot > maxSlots) continue;

        const nextScore = currentScore + edge.points;
        const nextExactMinutes = bestExactMinutes[timeSlot][stationIndex] + edge.rideMinutes;

        const shouldReplace =
          nextScore > bestScore[nextSlot][edge.toIndex] ||
          (nextScore === bestScore[nextSlot][edge.toIndex] &&
            nextExactMinutes < bestExactMinutes[nextSlot][edge.toIndex]);

        if (shouldReplace) {
          bestScore[nextSlot][edge.toIndex] = nextScore;
          bestExactMinutes[nextSlot][edge.toIndex] = nextExactMinutes;
          previous[nextSlot][edge.toIndex] = {
            edge,
            previousSlot: timeSlot,
            previousStationIndex: stationIndex,
          };
        }
      }
    }
  }

  let finalSlot = 0;
  let finalScore = bestScore[0][endIndex];
  let finalExactMinutes = bestExactMinutes[0][endIndex];

  for (let timeSlot = 1; timeSlot <= maxSlots; timeSlot += 1) {
    const score = bestScore[timeSlot][endIndex];
    const exactMinutes = bestExactMinutes[timeSlot][endIndex];
    if (
      score > finalScore ||
      (score === finalScore && exactMinutes < finalExactMinutes)
    ) {
      finalScore = score;
      finalExactMinutes = exactMinutes;
      finalSlot = timeSlot;
    }
  }

  if (!Number.isFinite(finalScore)) {
    return null;
  }

  const path = [];
  let cursorSlot = finalSlot;
  let cursorStation = endIndex;

  while (previous[cursorSlot][cursorStation]) {
    const step = previous[cursorSlot][cursorStation];
    path.push(step.edge);
    cursorSlot = step.previousSlot;
    cursorStation = step.previousStationIndex;
  }

  path.reverse();

  const totalDistanceKm = path.reduce((sum, edge) => sum + edge.distanceKm, 0);
  const totalRideMinutes = path.reduce((sum, edge) => sum + edge.rideMinutes, 0);
  const totalStartBonus = path.reduce((sum, edge) => sum + edge.startBonus, 0);
  const totalFinishBonus = path.reduce((sum, edge) => sum + edge.finishBonus, 0);
  const rideSteps = path.map((edge, index) => ({
    distanceKm: edge.distanceKm,
    finishBonus: edge.finishBonus,
    from: stations[edge.fromIndex],
    points: edge.points,
    sequence: index + 1 + preRideSteps.length,
    startBonus: edge.startBonus,
    title: `${stations[edge.fromIndex].label} → ${stations[edge.toIndex].label}`,
    to: stations[edge.toIndex],
    travelMinutes: edge.rideMinutes,
    type: "ride",
  }));

  const walkingSteps = preRideSteps.map((step, index) => ({
    ...step,
    sequence: index + 1,
  }));

  const steps = [...walkingSteps, ...rideSteps];

  const totalWalkDistanceKm = walkingSteps.reduce((sum, step) => sum + step.distanceKm, 0);
  const totalWalkMinutes = walkingSteps.reduce((sum, step) => sum + step.travelMinutes, 0);

  return {
    endIndex,
    endStation: stations[endIndex],
    finishAt: finalExactMinutes,
    bikePickupStation: stations[rideStartIndex],
    points: finalScore,
    rides: path.length,
    route: rideSteps,
    startOrigin: startLocationOrigin,
    startStation: chosenStartStation,
    steps,
    totalDistanceKm: totalDistanceKm + totalWalkDistanceKm,
    totalFinishBonus,
    totalRideMinutes,
    totalStartBonus,
    totalTravelMinutes: totalRideMinutes + totalWalkMinutes,
    totalWalkDistanceKm,
    totalWalkMinutes,
    walkSteps: walkingSteps,
  };
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "0m";
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes - hours * 60;
  return `${hours}h ${remainder.toFixed(1)}m`;
}

function renderPlan(plan) {
  state.plan = plan;

  elements.pointsValue.textContent = plan ? String(plan.points) : "0";
  elements.ridesValue.textContent = plan ? String(plan.rides) : "0";
  elements.timeValue.textContent = plan ? formatMinutes(plan.totalTravelMinutes) : "0m";
  elements.distanceValue.textContent = plan ? `${plan.totalDistanceKm.toFixed(1)} km` : "0 km";

  if (!plan) {
    elements.summaryDetails.innerHTML = `
      <p class="summary-placeholder">
        Load a live or demo snapshot, choose a start and finish station, then run the planner.
      </p>
    `;
    elements.routeList.innerHTML = "";
    drawNetwork();
    return;
  }

  const occupiedNow = state.stations.filter(station => occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD).length;
  const emptyAfterDock = state.stations.filter(station => finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD).length;
  const nearestStationMarkup = plan.startOrigin
    ? `
      <div>
        <dt>Nearest station</dt>
        <dd>${plan.startStation.label}</dd>
      </div>
    `
    : "";
  const pickupMarkup = plan.bikePickupStation.code !== plan.startStation.code
    ? `
      <div>
        <dt>Bike pickup station</dt>
        <dd>${plan.bikePickupStation.label}</dd>
      </div>
    `
    : "";
  const initialWalkingMarkup = plan.totalWalkMinutes > 0
    ? `
      <div>
        <dt>Initial walking</dt>
        <dd>${formatMinutes(plan.totalWalkMinutes)} · ${plan.totalWalkDistanceKm.toFixed(1)} km</dd>
      </div>
    `
    : "";

  elements.summaryDetails.innerHTML = `
    <dl class="summary-breakdown">
      <div>
        <dt>Start</dt>
        <dd>${plan.startOrigin ? "Current location" : plan.startStation.label}</dd>
      </div>
      <div>
        <dt>Finish</dt>
        <dd>${plan.endStation.label}</dd>
      </div>
      ${nearestStationMarkup}
      ${pickupMarkup}
      ${initialWalkingMarkup}
      <div>
        <dt>Start bonus points</dt>
        <dd>${plan.totalStartBonus}</dd>
      </div>
      <div>
        <dt>Finish bonus points</dt>
        <dd>${plan.totalFinishBonus}</dd>
      </div>
      <div>
        <dt>Live bonus-ready starts</dt>
        <dd>${occupiedNow}</dd>
      </div>
      <div>
        <dt>Live bonus-ready finishes</dt>
        <dd>${emptyAfterDock}</dd>
      </div>
    </dl>
  `;

  elements.routeList.innerHTML = "";
  for (const step of plan.steps) {
    const item = document.createElement("li");
    item.className = "route-item";
    const isWalk = step.type === "walk";
    const pointsText = isWalk ? "Walk leg" : `+${step.points} pts`;
    const metaLabel = isWalk ? "Walking estimate" : "Travel estimate";
    const bonusText = isWalk
      ? "manual transfer · 0 pts"
      : `start +${step.startBonus} · finish +${step.finishBonus}`;
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
          <span>Distance</span>
          <strong>${step.distanceKm.toFixed(1)} km</strong>
        </div>
        <div>
          <span>${isWalk ? "Leg type" : "Bonus split"}</span>
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
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.001);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.001);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const projected = new Map();
  const projectionSources = [...stations];

  for (const station of focusStations) {
    if (!station || projectionSources.some(entry => entry.code === station.code)) continue;
    projectionSources.push(station);
  }

  for (const station of projectionSources) {
    const x = padding + ((station.longitude - bounds.minLng) / lngSpan) * usableWidth;
    const y = height - padding - ((station.latitude - bounds.minLat) / latSpan) * usableHeight;
    projected.set(station.code, { x, y });
  }

  const visibleStations = stations.filter(station => stationIsInsideBounds(station, bounds));

  return {
    bounds,
    projected,
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
  const prefix = step.type === "walk" ? '<span class="route-item__prefix">Walk:</span> ' : "";
  return `${prefix}${renderStationLink(step.from)} <span class="route-item__arrow">→</span> ${renderStationLink(step.to)}`;
}

function drawNetwork() {
  const svg = elements.networkSvg;
  const tooltip = elements.networkTooltip;
  const stations = state.stations;
  const focusStations = getFocusStations();
  const { projected, visibleStations } = projectStations(stations, focusStations);

  svg.innerHTML = "";

  const background = document.createElementNS("http://www.w3.org/2000/svg", "g");
  for (let index = 0; index < 7; index += 1) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const y = 80 + index * 85;
    line.setAttribute(
      "d",
      `M 20 ${y} C 220 ${y - 20}, 420 ${y + 18}, 980 ${y - 12}`
    );
    line.setAttribute("stroke", "rgba(23, 35, 20, 0.06)");
    line.setAttribute("stroke-width", "1.2");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke-dasharray", "5 10");
    background.appendChild(line);
  }
  svg.appendChild(background);

  const projectionLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  projectionLabel.setAttribute("x", "32");
  projectionLabel.setAttribute("y", "42");
  projectionLabel.setAttribute("fill", "rgba(23, 35, 20, 0.5)");
  projectionLabel.setAttribute("font-family", "IBM Plex Mono, monospace");
  projectionLabel.setAttribute("font-size", "14");
  projectionLabel.textContent = state.plan
    ? "Zoomed to the planned route corridor · north is up"
    : "Projected station layout · north is up";
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
      label.textContent = "You";
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

    group.addEventListener("mousemove", event => {
      tooltip.hidden = false;
      tooltip.style.left = `${event.offsetX}px`;
      tooltip.style.top = `${event.offsetY}px`;
      tooltip.innerHTML = `
        <strong>${escapeHtml(station.label)}</strong>
        <div>${station.bikes}/${station.docks} bikes occupied</div>
        <div>Start bonus now: ${occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD ? "Yes" : "No"}</div>
        <div>Finish bonus after docking: ${finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD ? "Yes" : "No"}</div>
      `;
    });

    group.addEventListener("mouseleave", () => {
      tooltip.hidden = true;
    });

    svg.appendChild(group);
  });
}

async function runPlanner() {
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
    showToast("Choose both the start and finish station from the dropdowns.", "error");
    return;
  }

  try {
    const plan = computeOptimalPlan({
      stations: state.stations,
      startCode: startStation.code,
      startLocationOrigin,
      endCode: endStation.code,
      budgetMinutes: Number(elements.budgetInput.value),
      detourFactor: Number(elements.detourInput.value),
      rideOverheadMinutes: Number(elements.overheadInput.value),
      speedKmh: Number(elements.speedInput.value),
    });

    if (!plan) {
      renderPlan(null);
      showToast("No feasible path was found inside the current time budget.", "error");
      return;
    }

    renderPlan(plan);
    showToast(`Best route found: ${plan.points} points across ${plan.rides} rides.`);
  } catch (error) {
    showToast(error.message, "error");
  }
}

elements.loginForm.addEventListener("submit", login);
elements.logoutButton.addEventListener("click", logout);
elements.loadLiveButton.addEventListener("click", loadLiveStations);
elements.demoButton.addEventListener("click", loadDemoStations);
elements.startInput.addEventListener("change", () => {
  handleStartSelectionChange().catch(error => {
    showToast(error.message, "error");
  });
});
elements.planButton.addEventListener("click", () => {
  runPlanner().catch(error => {
    showToast(error.message, "error");
  });
});

window.addEventListener("resize", drawNetwork);

hydrateSavedCredentials()
  .catch(() => null)
  .finally(() => {
    syncSession().catch(() => {
      setUser(null);
    });
  });

renderSnapshotMeta();
renderPlan(null);
