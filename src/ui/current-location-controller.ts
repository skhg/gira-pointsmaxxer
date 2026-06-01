import { findNearestStation } from "../lib/planner.js";
import type { AppError, LocationSnapshot, MessageValues, Station } from "../types.js";
import type { AppElements } from "./app-elements.js";
import type { AppState } from "./app-state.js";

interface CurrentLocationControllerOptions {
  currentLocationCacheMs: number;
  currentLocationOriginCode: string;
  currentLocationValue: string;
  elements: Pick<AppElements, "currentLocationButton" | "startInput">;
  getErrorMessage: (error: unknown) => string;
  showToast: (message: string, type?: string) => void;
  state: AppState;
  translate: (key: string, values?: MessageValues) => string;
  updateCurrentLocationOptionLabel: () => void;
  updatePlannerAvailability: () => void;
}

function createCurrentLocationError(translationKey: string): AppError {
  const error = new Error(translationKey) as AppError;
  error.translationKey = translationKey;
  return error;
}

function getGeolocationErrorKey(code: number | undefined) {
  if (code === 1) return "errors.locationPermissionDenied";
  if (code === 2) return "errors.locationUnavailable";
  if (code === 3) return "errors.locationTimeout";
  return "errors.currentLocationUnavailable";
}

export function createCurrentLocationController({
  currentLocationCacheMs,
  currentLocationOriginCode,
  currentLocationValue,
  elements,
  getErrorMessage,
  showToast,
  state,
  translate: t,
  updateCurrentLocationOptionLabel,
  updatePlannerAvailability,
}: CurrentLocationControllerOptions) {
  function createCurrentLocationOrigin(
    position: Pick<LocationSnapshot, "latitude" | "longitude">
  ): Station {
    return {
      assetStatus: "active",
      bikes: 0,
      code: currentLocationOriginCode,
      docks: 0,
      label: t("controls.currentLocation"),
      latitude: Number(position.latitude),
      longitude: Number(position.longitude),
      name: t("controls.currentLocation"),
      serialNumber: currentLocationOriginCode,
    };
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
      throw createCurrentLocationError("errors.geolocationUnsupported");
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
          reject(createCurrentLocationError(getGeolocationErrorKey(error?.code)));
        },
        {
          enableHighAccuracy: true,
          maximumAge: forceFresh ? 0 : currentLocationCacheMs,
          timeout: 10000,
        }
      );
    });
  }

  async function resolveCurrentLocationStart(
    options: { forceRefresh?: boolean } = {}
  ): Promise<{ origin: Station; station: Station }> {
    const { forceRefresh = false } = options;
    if (state.stations.length === 0) {
      throw createCurrentLocationError("errors.loadSnapshotFirst");
    }

    const cachedLocation =
      !forceRefresh &&
      state.currentLocation &&
      Date.now() - state.currentLocation.capturedAt <= currentLocationCacheMs
        ? state.currentLocation
        : null;

    const position =
      cachedLocation || (await requestCurrentLocationPosition({ forceFresh: forceRefresh }));
    const origin = createCurrentLocationOrigin(position);
    const nearestStation = findNearestStation(
      origin,
      state.stations,
      station => station.assetStatus === "active" && station.docks > 0
    );

    if (!nearestStation) {
      throw createCurrentLocationError("errors.noActiveStationsNearLocation");
    }

    state.currentLocation = {
      ...position,
      nearestStationCode: nearestStation.code,
      nearestStationLabel: nearestStation.label || nearestStation.name || nearestStation.code,
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
      elements.startInput.value = currentLocationValue;
    }

    state.isResolvingCurrentLocation = true;
    elements.currentLocationButton.textContent = "📍…";
    updatePlannerAvailability();
    showToast(t("toasts.checkingCurrentLocation"));

    try {
      const resolved = await resolveCurrentLocationStart({ forceRefresh });
      elements.startInput.value = currentLocationValue;
      showToast(
        t("toasts.currentLocationResolved", {
          label: resolved.station.label || resolved.station.name || resolved.station.code,
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
    if (elements.startInput.value !== currentLocationValue) return;
    await activateCurrentLocation({ preserveSelectionOnFailure: true });
  }

  return {
    activateCurrentLocation,
    handleStartSelectionChange,
    resolveCurrentLocationStart,
  };
}
