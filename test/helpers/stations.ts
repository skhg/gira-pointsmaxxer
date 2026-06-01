import type { Station } from "../../src/types.js";

export function buildStation(overrides: Partial<Station> = {}): Station {
  const code = String(overrides.code || "100");
  return {
    assetStatus: "active",
    bikes: 5,
    code,
    displayCode: code,
    docks: 10,
    label: `${code} - Test station ${code}`,
    latitude: 38.72,
    longitude: -9.14,
    name: `Test station ${code}`,
    serialNumber: `test-${code}`,
    ...overrides,
  };
}

export function decorateStations<T extends Partial<Station>>(stations: T[]) {
  return stations.map(station => ({
    displayCode: station.displayCode || String(station.code),
    label: station.label || `${station.code} - ${station.name || `Station ${station.code}`}`,
    ...station,
  }));
}
