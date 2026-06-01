import {
  DEFAULT_EMPTY_THRESHOLD,
  DEFAULT_OCCUPIED_THRESHOLD,
  finishBonusRatioAfterDock,
  occupiedRatioNow,
} from "../lib/planner.js";
import { decorateStationForDisplay, sortStationsByLabel } from "../lib/stations.js";
import type { MessageValues, Plan, Station, StationLike } from "../types.js";
import type { AppElements } from "./app-elements.js";
import type { AppState } from "./app-state.js";

interface StationPanelControllerOptions {
  currentLocationValue: string;
  drawNetwork: () => void;
  elements: Pick<
    AppElements,
    "endInput" | "snapshotSource" | "startInput" | "stationCount"
  >;
  getLocale: () => string;
  renderPlan: (plan: Plan | null) => void;
  state: AppState;
  translate: (key: string, values?: MessageValues) => string;
  updatePlannerAvailability: () => void;
}

export function createStationPanelController({
  currentLocationValue,
  drawNetwork,
  elements,
  getLocale,
  renderPlan,
  state,
  translate: t,
  updatePlannerAvailability,
}: StationPanelControllerOptions) {
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

  function getCurrentLocationOption() {
    return elements.startInput.querySelector(`option[value="${currentLocationValue}"]`);
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
        currentLocationOption.value = currentLocationValue;
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

    const preferredStart =
      state.stations.find(station => occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD) ||
      state.stations[0];
    const preferredEnd =
      state.stations.find(
        station => finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD
      ) || state.stations[1];

    const canReuseStart =
      previousStartValue === currentLocationValue || state.stationByCode.has(previousStartValue);
    const canReuseEnd = state.stationByCode.has(previousEndValue);

    elements.startInput.value = canReuseStart ? previousStartValue : preferredStart?.code || "";
    elements.endInput.value = canReuseEnd ? previousEndValue : preferredEnd?.code || "";
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

  function getSelectedStation(inputElement: HTMLSelectElement) {
    return state.stationByCode.get(inputElement.value) || null;
  }

  return {
    getCurrentLocationOption,
    getSelectedStation,
    renderSnapshotMeta,
    renderStationOptions,
    setStations,
    updateCurrentLocationOptionLabel,
  };
}
