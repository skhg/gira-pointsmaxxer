import {
  DEFAULT_EMPTY_THRESHOLD,
  DEFAULT_OCCUPIED_THRESHOLD,
  finishBonusRatioAfterDock,
  occupiedRatioNow,
} from "../lib/planner.js";
import type { MessageValues, Plan, Station, StationLike } from "../types.js";
import type { AppElements } from "./app-elements.js";

interface PlannerResultsRendererOptions {
  drawNetwork: () => void;
  elements: Pick<
    AppElements,
    | "distanceValue"
    | "pointsValue"
    | "ridesValue"
    | "routeList"
    | "summaryDetails"
    | "timeValue"
  >;
  getLocale: () => string;
  getStations: () => Station[];
  translate: (key: string, values?: MessageValues) => string;
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildGoogleMapsUrl(station: Pick<StationLike, "latitude" | "longitude">) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${station.latitude},${station.longitude}`
  )}`;
}

export function createPlannerResultsRenderer({
  drawNetwork,
  elements,
  getLocale,
  getStations,
  translate: t,
}: PlannerResultsRendererOptions) {
  function formatClockTime(date: Date) {
    return new Intl.DateTimeFormat(getLocale(), {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function formatMinuteValue(value: number, decimals = 0) {
    const safeValue = Math.max(0, Number(value) || 0);
    const displayValue = decimals > 0 ? safeValue.toFixed(decimals) : String(Math.floor(safeValue));
    const numericValue = Number(displayValue);
    const unit =
      Math.abs(numericValue - 1) < 1e-9 ? t("units.minuteOne") : t("units.minuteOther");
    return `${displayValue} ${unit}`;
  }

  function formatRemainingTime(minutes: number) {
    const totalMinutes = Math.max(0, Math.floor(minutes));
    if (totalMinutes < 60) return formatMinuteValue(totalMinutes);

    const hours = Math.floor(totalMinutes / 60);
    const remainder = totalMinutes % 60;
    if (remainder === 0) return `${hours}${t("units.hour")}`;
    return `${hours}${t("units.hour")} ${formatMinuteValue(remainder)}`;
  }

  function formatMinutes(minutes: number) {
    if (!Number.isFinite(minutes)) return `0 ${t("units.minuteOther")}`;
    if (minutes < 60) return formatMinuteValue(minutes, 1);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes - hours * 60;
    if (remainder < 0.05) return `${hours}${t("units.hour")}`;
    return `${hours}${t("units.hour")} ${formatMinuteValue(remainder, 1)}`;
  }

  function renderStationLink(station: Pick<StationLike, "label" | "latitude" | "longitude">) {
    return `<a class="route-item__station-link" href="${escapeHtml(buildGoogleMapsUrl(station))}" target="_blank" rel="noopener noreferrer">${escapeHtml(station.label)}</a>`;
  }

  function renderStepTitle(step: Plan["steps"][number]) {
    const prefix =
      step.type === "walk"
        ? `<span class="route-item__prefix">${escapeHtml(t("route.walkPrefix"))}</span> `
        : "";
    return `${prefix}${renderStationLink(step.from)} <span class="route-item__arrow">→</span> ${renderStationLink(step.to)}`;
  }

  function renderPlan(plan: Plan | null) {
    elements.pointsValue.textContent = plan ? String(plan.points) : "0";
    elements.ridesValue.textContent = plan ? String(plan.rides) : "0";
    elements.timeValue.textContent = plan
      ? formatMinutes(plan.totalTravelMinutes)
      : `0 ${t("units.minuteOther")}`;
    elements.distanceValue.textContent = plan
      ? `${plan.totalDistanceKm.toFixed(1)} ${t("units.kilometer")}`
      : `0 ${t("units.kilometer")}`;

    if (!plan) {
      elements.summaryDetails.innerHTML = `
        <p class="summary-placeholder">
          ${escapeHtml(t("summary.placeholder"))}
        </p>
      `;
      elements.routeList.innerHTML = "";
      drawNetwork();
      return;
    }

    const stations = getStations();
    const occupiedNow = stations.filter(
      station => occupiedRatioNow(station) > DEFAULT_OCCUPIED_THRESHOLD
    ).length;
    const emptyAfterDock = stations.filter(
      station => finishBonusRatioAfterDock(station) > DEFAULT_EMPTY_THRESHOLD
    ).length;
    const safeNearestStationLabel = plan.startOrigin ? escapeHtml(plan.startStation.label) : "";
    const safePickupLabel =
      plan.bikePickupStation.code !== plan.startStation.code
        ? escapeHtml(plan.bikePickupStation.label)
        : "";
    const safeStartLabel = escapeHtml(
      plan.startOrigin ? t("controls.currentLocation") : plan.startStation.label
    );
    const safeEndLabel = escapeHtml(plan.endStation.label);
    const nearestStationMarkup = plan.startOrigin
      ? `
        <div>
          <dt>${escapeHtml(t("summary.nearestStation"))}</dt>
          <dd>${safeNearestStationLabel}</dd>
        </div>
      `
      : "";
    const pickupMarkup =
      plan.bikePickupStation.code !== plan.startStation.code
        ? `
          <div>
            <dt>${escapeHtml(t("summary.bikePickupStation"))}</dt>
            <dd>${safePickupLabel}</dd>
          </div>
        `
        : "";
    const initialWalkingMarkup =
      plan.totalWalkMinutes > 0
        ? `
          <div>
            <dt>${escapeHtml(t("summary.initialWalking"))}</dt>
            <dd>${formatMinutes(plan.totalWalkMinutes)} · ${plan.totalWalkDistanceKm.toFixed(1)} ${t("units.kilometer")}</dd>
          </div>
        `
        : "";

    elements.summaryDetails.innerHTML = `
      <dl class="summary-breakdown">
        <div>
          <dt>${escapeHtml(t("summary.plannedAt"))}</dt>
          <dd>${formatClockTime(plan.plannedAt)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("summary.finishBy"))}</dt>
          <dd>${formatClockTime(plan.challengeFinishTime)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("summary.minutesRemaining"))}</dt>
          <dd>${formatMinutes(plan.challengeRemainingMinutes)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("summary.start"))}</dt>
          <dd>${safeStartLabel}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("summary.finish"))}</dt>
          <dd>${safeEndLabel}</dd>
        </div>
        ${nearestStationMarkup}
        ${pickupMarkup}
        ${initialWalkingMarkup}
        <div>
          <dt>${escapeHtml(t("summary.bufferAfterRoute"))}</dt>
          <dd>${formatMinutes(plan.remainingBufferMinutes)}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("summary.startBonusPoints"))}</dt>
          <dd>${plan.totalStartBonus}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("summary.finishBonusPoints"))}</dt>
          <dd>${plan.totalFinishBonus}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("summary.liveBonusReadyStarts"))}</dt>
          <dd>${occupiedNow}</dd>
        </div>
        <div>
          <dt>${escapeHtml(t("summary.liveBonusReadyFinishes"))}</dt>
          <dd>${emptyAfterDock}</dd>
        </div>
      </dl>
    `;

    elements.routeList.innerHTML = "";
    for (const step of plan.steps) {
      const item = document.createElement("li");
      item.className = "route-item";
      const isWalk = step.type === "walk";
      const pointsText = isWalk ? t("route.walkLeg") : `+${step.points} ${t("units.points")}`;
      const metaLabel = isWalk ? t("route.walkingEstimate") : t("route.travelEstimate");
      const bonusText = isWalk
        ? t("route.manualTransfer")
        : t("route.bonusText", {
            finishBonus: step.finishBonus,
            startBonus: step.startBonus,
          });
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
            <span>${escapeHtml(t("route.distance"))}</span>
            <strong>${step.distanceKm.toFixed(1)} ${t("units.kilometer")}</strong>
          </div>
          <div>
            <span>${escapeHtml(isWalk ? t("route.legType") : t("route.bonusSplit"))}</span>
            <strong>${bonusText}</strong>
          </div>
        </div>
      `;
      elements.routeList.appendChild(item);
    }

    drawNetwork();
  }

  return {
    formatClockTime,
    formatMinuteValue,
    formatMinutes,
    formatRemainingTime,
    renderPlan,
  };
}
