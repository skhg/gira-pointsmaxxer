import type { Station, StationLike } from "../types.js";

export function stripLeadingZeros(value: unknown) {
  const stripped = String(value ?? "").replace(/^0+(?=\d)/, "");
  return stripped || String(value ?? "");
}

export function stripStationCodePrefix(value = "") {
  return String(value).replace(/^\d+\s*-\s*/u, "").trim();
}

export function normalizeStationName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^\d+\s*-\s*/u, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getStationDisplayCode(station?: Partial<StationLike> | null) {
  const rawCode = String(station?.displayCode || station?.shortCode || station?.code || "");
  return rawCode.replace(/^0+(?=\d)/, "") || rawCode;
}

export function formatStationLabel(station: Partial<StationLike>) {
  const displayCode = getStationDisplayCode(station);
  const fallbackName = displayCode ? `Station ${displayCode}` : "Station";
  const name = stripStationCodePrefix(station?.name || station?.label || fallbackName);
  return `${displayCode} - ${name}`;
}

export function decorateStationForDisplay<T extends Partial<StationLike>>(station: T) {
  return {
    ...station,
    displayCode: getStationDisplayCode(station),
    label: formatStationLabel(station),
  };
}

export function sortStationsByLabel<T extends { label: string }>(stations: T[], locale = "en-GB") {
  return [...stations].sort((left, right) =>
    left.label.localeCompare(right.label, locale, { numeric: true })
  );
}

export function normalizeLiveStation(station: Partial<StationLike>): Station {
  return {
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
}

export function haversineKm(
  from: Pick<StationLike, "latitude" | "longitude">,
  to: Pick<StationLike, "latitude" | "longitude">
) {
  const earthRadiusKm = 6371;
  const fromLatitude = Number(from.latitude);
  const toLatitude = Number(to.latitude);
  const fromLongitude = Number(from.longitude);
  const toLongitude = Number(to.longitude);
  const lat1 = (fromLatitude * Math.PI) / 180;
  const lat2 = (toLatitude * Math.PI) / 180;
  const deltaLat = ((toLatitude - fromLatitude) * Math.PI) / 180;
  const deltaLon = ((toLongitude - fromLongitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
