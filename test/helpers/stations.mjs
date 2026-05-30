export function buildStation(overrides = {}) {
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

export function decorateStations(stations) {
  return stations.map(station => ({
    displayCode: station.displayCode || String(station.code),
    label: station.label || `${station.code} - ${station.name || `Station ${station.code}`}`,
    ...station,
  }));
}
