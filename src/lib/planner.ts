import { createPlannerError, PLANNER_ERROR_CODES } from "./planner-errors.js";
import { haversineKm } from "./stations.js";
import type { Plan, RideStep, Station, StationLike, WalkStep } from "../types.js";

export const RESOLUTION_SECONDS = 30;
export const DEFAULT_OCCUPIED_THRESHOLD = 0.7;
export const DEFAULT_EMPTY_THRESHOLD = 0.7;
export const DEFAULT_WALKING_SPEED_KMH = 4.8;
export const DEFAULT_WALKING_DETOUR_FACTOR = 1.12;

interface PlannerEdge {
  distanceKm: number;
  finishBonus: number;
  fromIndex: number;
  points: number;
  rideMinutes: number;
  slots: number;
  startBonus: number;
  toIndex: number;
}

interface PlannerCursorStep {
  edge: PlannerEdge;
  previousSlot: number;
  previousStationIndex: number;
}

interface PlannerConfig {
  budgetMinutes: number;
  detourFactor: number;
  endCode: string;
  finishDeadline: Date;
  plannedAt: Date;
  rideOverheadMinutes: number;
  speedKmh: number;
  startCode: string;
  startLocationOrigin?: StationLike | null;
  stations: Station[];
}

export function occupiedRatioNow(station: Pick<Station, "bikes" | "docks">) {
  return station.docks > 0 ? station.bikes / station.docks : 0;
}

export function finishBonusRatioAfterDock(station: Pick<Station, "bikes" | "docks">) {
  if (station.docks <= 0 || station.bikes >= station.docks) return -Infinity;
  return (station.docks - (station.bikes + 1)) / station.docks;
}

export function classifyStation(station: Pick<Station, "bikes" | "docks">) {
  const canStartBonus = occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD;
  const canFinishBonus = finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD;
  if (canStartBonus) return "occupied";
  if (canFinishBonus) return "empty";
  return "neutral";
}

export function estimateWalkLeg(from: StationLike, to: StationLike, detourFactor: number): WalkStep {
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

export function findNearestStation<TStation extends StationLike>(
  fromPoint: Pick<StationLike, "latitude" | "longitude">,
  stations: TStation[],
  predicate: (station: TStation) => boolean = () => true
) {
  let nearest: { distanceKm: number; station: TStation } | null = null;

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

export function findNearestAvailableBikeStation(startStation: Station, stations: Station[]) {
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

export function computeOptimalPlan(config: PlannerConfig): Plan | null {
  const {
    stations,
    startCode,
    endCode,
    budgetMinutes,
    finishDeadline,
    speedKmh,
    detourFactor,
    rideOverheadMinutes,
    plannedAt,
    startLocationOrigin = null,
  } = config;

  const startIndex = stations.findIndex(station => station.code === startCode);
  const endIndex = stations.findIndex(station => station.code === endCode);

  if (startIndex === -1 || endIndex === -1) {
    throw createPlannerError(PLANNER_ERROR_CODES.INVALID_STATION_SELECTION);
  }

  if (speedKmh <= 0 || detourFactor < 1 || budgetMinutes <= 0) {
    throw createPlannerError(PLANNER_ERROR_CODES.INVALID_INPUTS, {
      budgetMinutes,
      detourFactor,
      speedKmh,
    });
  }

  const maxSlots = Math.floor((budgetMinutes * 60) / RESOLUTION_SECONDS);
  if (maxSlots <= 0) {
    throw createPlannerError(PLANNER_ERROR_CODES.INSUFFICIENT_BUDGET, {
      budgetMinutes,
      maxSlots,
    });
  }

  const chosenStartStation = stations[startIndex];
  let rideStartIndex = startIndex;
  const preRideSteps: WalkStep[] = [];

  if (startLocationOrigin) {
    preRideSteps.push(estimateWalkLeg(startLocationOrigin, chosenStartStation, detourFactor));
  }

  if (chosenStartStation.bikes <= 0) {
    const nearestBikeStation = findNearestAvailableBikeStation(chosenStartStation, stations);
    if (!nearestBikeStation) {
      throw createPlannerError(PLANNER_ERROR_CODES.NO_BIKES_AT_START, {
        startCode,
      });
    }

    rideStartIndex = stations.findIndex(station => station.code === nearestBikeStation.code);
    preRideSteps.push(estimateWalkLeg(chosenStartStation, nearestBikeStation, detourFactor));
  }

  const initialSlot = preRideSteps.reduce((sum, step) => sum + step.slots, 0);
  if (initialSlot > maxSlots) {
    return null;
  }

  const edges: PlannerEdge[][] = Array.from({ length: stations.length }, () => []);

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
  const previous: Array<Array<PlannerCursorStep | null>> = Array.from({ length: maxSlots + 1 }, () =>
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

  const path: PlannerEdge[] = [];
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
  const rideSteps: RideStep[] = path.map((edge, index) => ({
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

  const walkingSteps: WalkStep[] = preRideSteps.map((step, index) => ({
    ...step,
    sequence: index + 1,
  }));

  const steps = [...walkingSteps, ...rideSteps];

  const totalWalkDistanceKm = walkingSteps.reduce((sum, step) => sum + step.distanceKm, 0);
  const totalWalkMinutes = walkingSteps.reduce((sum, step) => sum + step.travelMinutes, 0);

  return {
    challengeFinishTime: finishDeadline,
    challengeRemainingMinutes: budgetMinutes,
    endIndex,
    endStation: stations[endIndex],
    finishAt: finalExactMinutes,
    bikePickupStation: stations[rideStartIndex],
    plannedAt,
    points: finalScore,
    remainingBufferMinutes: Math.max(0, budgetMinutes - (totalRideMinutes + totalWalkMinutes)),
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
