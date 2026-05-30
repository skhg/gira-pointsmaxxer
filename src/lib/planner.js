export const RESOLUTION_SECONDS = 30;
export const DEFAULT_OCCUPIED_THRESHOLD = 0.7;
export const DEFAULT_EMPTY_THRESHOLD = 0.7;
export const DEFAULT_WALKING_SPEED_KMH = 4.8;
export const DEFAULT_WALKING_DETOUR_FACTOR = 1.12;

export function occupiedRatioNow(station) {
  return station.docks > 0 ? station.bikes / station.docks : 0;
}

export function finishBonusRatioAfterDock(station) {
  if (station.docks <= 0 || station.bikes >= station.docks) return -Infinity;
  return (station.docks - (station.bikes + 1)) / station.docks;
}

export function classifyStation(station) {
  const canStartBonus = occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD;
  const canFinishBonus = finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD;
  if (canStartBonus) return "occupied";
  if (canFinishBonus) return "empty";
  return "neutral";
}

export function haversineKm(from, to) {
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

export function estimateWalkLeg(from, to, detourFactor) {
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

export function findNearestStation(fromPoint, stations, predicate = () => true) {
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

export function findNearestAvailableBikeStation(startStation, stations) {
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

export function computeOptimalPlan(config) {
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
    throw new Error("Pick both a valid start and finish station.");
  }

  if (speedKmh <= 0 || detourFactor < 1 || budgetMinutes <= 0) {
    throw new Error("The speed, detour factor, and remaining time must all be positive.");
  }

  const maxSlots = Math.floor((budgetMinutes * 60) / RESOLUTION_SECONDS);
  if (maxSlots <= 0) throw new Error("Not enough time remains for the current planner resolution.");

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
