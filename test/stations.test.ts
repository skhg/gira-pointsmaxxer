import assert from "node:assert/strict";
import test from "node:test";

import {
  decorateStationForDisplay,
  normalizeLiveStation,
  normalizeStationName,
} from "../src/lib/stations.js";

test("station helpers normalize live payloads and decorate labels consistently", () => {
  const normalized = normalizeLiveStation({
    assetStatus: "active",
    bikes: "7",
    code: "000000421",
    description: "421 - Alameda",
    docks: "20",
    latitude: "38.73937",
    longitude: "-9.14199",
    serialNumber: 421,
  });

  const decorated = decorateStationForDisplay({
    ...normalized,
    displayCode: normalized.code,
  });

  assert.equal(normalized.bikes, 7);
  assert.equal(normalized.docks, 20);
  assert.equal(normalized.serialNumber, "421");
  assert.equal(decorated.displayCode, "421");
  assert.equal(decorated.label, "421 - Alameda");
});

test("normalizeStationName removes accents, punctuation, and numeric prefixes", () => {
  assert.equal(
    normalizeStationName("00421 - Alameda D. Afonso Henriques / Praça do Chile"),
    "alameda d afonso henriques praca do chile"
  );
});
