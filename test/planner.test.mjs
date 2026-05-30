import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyStation,
  computeOptimalPlan,
  findNearestAvailableBikeStation,
  finishBonusRatioAfterDock,
  occupiedRatioNow,
} from "../src/lib/planner.js";
import { demoStations } from "../testing/fixtures/demo-stations.js";
import { buildStation, decorateStations } from "./helpers/stations.mjs";

test("station bonus helpers classify occupied, empty, and neutral stations", () => {
  const occupied = buildStation({ bikes: 8, docks: 10 });
  const empty = buildStation({ bikes: 1, docks: 10 });
  const neutral = buildStation({ bikes: 5, docks: 10 });

  assert.equal(occupiedRatioNow(occupied), 0.8);
  assert.equal(finishBonusRatioAfterDock(empty), 0.8);
  assert.equal(classifyStation(occupied), "occupied");
  assert.equal(classifyStation(empty), "empty");
  assert.equal(classifyStation(neutral), "neutral");
});

test("planner chooses the highest-value loop and ends at the requested finish station", () => {
  const stations = decorateStations([
    buildStation({
      bikes: 8,
      code: "A",
      displayCode: "A",
      docks: 10,
      label: "A - Start bonus",
      longitude: -9.14,
    }),
    buildStation({
      bikes: 1,
      code: "B",
      displayCode: "B",
      docks: 10,
      label: "B - Finish bonus",
      longitude: -9.14,
    }),
    buildStation({
      bikes: 4,
      code: "C",
      displayCode: "C",
      docks: 10,
      label: "C - Decoy",
      longitude: -9.13,
    }),
  ]);

  const plan = computeOptimalPlan({
    budgetMinutes: 1.6,
    detourFactor: 1,
    endCode: "B",
    finishDeadline: new Date("2026-05-30T12:00:00Z"),
    plannedAt: new Date("2026-05-30T10:00:00Z"),
    rideOverheadMinutes: 0,
    speedKmh: 60,
    startCode: "A",
    stations,
  });

  assert.ok(plan);
  assert.equal(plan.points, 430);
  assert.equal(plan.rides, 3);
  assert.deepEqual(
    plan.route.map(step => [step.from.code, step.to.code]),
    [
      ["A", "B"],
      ["B", "A"],
      ["A", "B"],
    ]
  );
  assert.equal(plan.endStation.code, "B");
});

test("planner inserts a walking transfer when the selected start station has no bikes", () => {
  const stations = decorateStations([
    buildStation({
      bikes: 0,
      code: "A",
      displayCode: "A",
      label: "A - Empty start",
      latitude: 38.72,
      longitude: -9.14,
    }),
    buildStation({
      bikes: 6,
      code: "B",
      displayCode: "B",
      label: "B - Pickup",
      latitude: 38.7205,
      longitude: -9.1395,
    }),
    buildStation({
      bikes: 1,
      code: "C",
      displayCode: "C",
      label: "C - Finish",
      latitude: 38.721,
      longitude: -9.139,
    }),
  ]);

  const plan = computeOptimalPlan({
    budgetMinutes: 20,
    detourFactor: 1.1,
    endCode: "C",
    finishDeadline: new Date("2026-05-30T12:00:00Z"),
    plannedAt: new Date("2026-05-30T10:00:00Z"),
    rideOverheadMinutes: 1,
    speedKmh: 15,
    startCode: "A",
    stations,
  });

  assert.ok(plan);
  assert.equal(plan.startStation.code, "A");
  assert.equal(plan.bikePickupStation.code, "B");
  assert.equal(plan.walkSteps.length, 1);
  assert.equal(plan.steps[0].type, "walk");
  assert.deepEqual(
    [plan.steps[0].from.code, plan.steps[0].to.code],
    ["A", "B"]
  );
});

test("nearest available bike station ignores inactive or empty stations", () => {
  const start = buildStation({ bikes: 0, code: "A", latitude: 38.72, longitude: -9.14 });
  const nearest = findNearestAvailableBikeStation(start, [
    start,
    buildStation({
      assetStatus: "inactive",
      bikes: 8,
      code: "B",
      latitude: 38.7201,
      longitude: -9.1399,
    }),
    buildStation({
      bikes: 0,
      code: "C",
      latitude: 38.7202,
      longitude: -9.1398,
    }),
    buildStation({
      bikes: 4,
      code: "D",
      latitude: 38.7203,
      longitude: -9.1397,
    }),
  ]);

  assert.equal(nearest?.code, "D");
});

test("demo fixture can produce a feasible route without UI wiring", () => {
  const stations = decorateStations(
    demoStations.map(station => ({
      ...station,
      displayCode: station.code,
      label: `${station.code} - ${station.name.replace(/^\d+\s*-\s*/u, "")}`,
    }))
  );

  const plan = computeOptimalPlan({
    budgetMinutes: 95,
    detourFactor: 1.22,
    endCode: "105",
    finishDeadline: new Date("2026-05-30T12:00:00Z"),
    plannedAt: new Date("2026-05-30T10:25:00Z"),
    rideOverheadMinutes: 5,
    speedKmh: 15,
    startCode: "104",
    stations,
  });

  assert.ok(plan);
  assert.equal(plan.startStation.code, "104");
  assert.equal(plan.endStation.code, "105");
  assert.ok(plan.points > 0);
  assert.ok(plan.route.length > 0);
});
