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
  onStationLinkOpened?: () => void;
  translate: (key: string, values?: MessageValues) => string;
}

function buildGoogleMapsUrl(station: Pick<StationLike, "latitude" | "longitude">) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${station.latitude},${station.longitude}`
  )}`;
}

function appendSummaryEntry(
  listElement: HTMLDListElement,
  label: string,
  value: string | number
) {
  const wrapper = document.createElement("div");
  const labelElement = document.createElement("dt");
  labelElement.textContent = String(label);
  const valueElement = document.createElement("dd");
  valueElement.textContent = String(value);
  wrapper.append(labelElement, valueElement);
  listElement.appendChild(wrapper);
}

function getStationLabel(station: Pick<StationLike, "code" | "label">) {
  return String(station.label || station.code);
}

export function createPlannerResultsRenderer({
  drawNetwork,
  elements,
  getLocale,
  getStations,
  onStationLinkOpened,
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

  function renderStationLink(station: Pick<StationLike, "code" | "label" | "latitude" | "longitude">) {
    const link = document.createElement("a");
    link.className = "route-item__station-link";
    link.href = buildGoogleMapsUrl(station);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = getStationLabel(station);
    link.addEventListener("click", () => {
      onStationLinkOpened?.();
    });
    return link;
  }

  function renderStepTitle(step: Plan["steps"][number]) {
    const fragment = document.createDocumentFragment();
    if (step.type === "walk") {
      const prefix = document.createElement("span");
      prefix.className = "route-item__prefix";
      prefix.textContent = t("route.walkPrefix");
      fragment.append(prefix, document.createTextNode(" "));
    }

    fragment.append(renderStationLink(step.from));

    const arrow = document.createElement("span");
    arrow.className = "route-item__arrow";
    arrow.textContent = "→";
    fragment.append(document.createTextNode(" "), arrow, document.createTextNode(" "));

    fragment.append(renderStationLink(step.to));
    return fragment;
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
      const placeholder = document.createElement("p");
      placeholder.className = "summary-placeholder";
      placeholder.textContent = t("summary.placeholder");
      elements.summaryDetails.replaceChildren(placeholder);
      elements.routeList.replaceChildren();
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
    const safeStartLabel = plan.startOrigin
      ? t("controls.currentLocation")
      : getStationLabel(plan.startStation);
    const safeEndLabel = getStationLabel(plan.endStation);

    const breakdown = document.createElement("dl");
    breakdown.className = "summary-breakdown";
    appendSummaryEntry(breakdown, t("summary.plannedAt"), formatClockTime(plan.plannedAt));
    appendSummaryEntry(
      breakdown,
      t("summary.finishBy"),
      formatClockTime(plan.challengeFinishTime)
    );
    appendSummaryEntry(
      breakdown,
      t("summary.minutesRemaining"),
      formatMinutes(plan.challengeRemainingMinutes)
    );
    appendSummaryEntry(breakdown, t("summary.start"), safeStartLabel);
    appendSummaryEntry(breakdown, t("summary.finish"), safeEndLabel);

    if (plan.startOrigin) {
      appendSummaryEntry(breakdown, t("summary.nearestStation"), getStationLabel(plan.startStation));
    }

    if (plan.bikePickupStation.code !== plan.startStation.code) {
      appendSummaryEntry(
        breakdown,
        t("summary.bikePickupStation"),
        getStationLabel(plan.bikePickupStation)
      );
    }

    if (plan.totalWalkMinutes > 0) {
      appendSummaryEntry(
        breakdown,
        t("summary.initialWalking"),
        `${formatMinutes(plan.totalWalkMinutes)} · ${plan.totalWalkDistanceKm.toFixed(1)} ${t("units.kilometer")}`
      );
    }

    appendSummaryEntry(
      breakdown,
      t("summary.bufferAfterRoute"),
      formatMinutes(plan.remainingBufferMinutes)
    );
    appendSummaryEntry(breakdown, t("summary.startBonusPoints"), plan.totalStartBonus);
    appendSummaryEntry(breakdown, t("summary.finishBonusPoints"), plan.totalFinishBonus);
    appendSummaryEntry(breakdown, t("summary.liveBonusReadyStarts"), occupiedNow);
    appendSummaryEntry(breakdown, t("summary.liveBonusReadyFinishes"), emptyAfterDock);
    elements.summaryDetails.replaceChildren(breakdown);

    elements.routeList.replaceChildren();
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

      const top = document.createElement("div");
      top.className = "route-item__top";

      const headingWrap = document.createElement("div");
      const index = document.createElement("span");
      index.className = "route-item__index";
      index.textContent = String(step.sequence);
      const title = document.createElement("h3");
      title.className = "route-item__title";
      title.append(renderStepTitle(step));
      headingWrap.append(index, title);

      const points = document.createElement("span");
      points.className = "route-item__points";
      points.textContent = pointsText;
      top.append(headingWrap, points);

      const meta = document.createElement("div");
      meta.className = "route-item__meta";

      const timeMeta = document.createElement("div");
      const timeLabel = document.createElement("span");
      timeLabel.textContent = metaLabel;
      const timeValue = document.createElement("strong");
      timeValue.textContent = formatMinutes(step.travelMinutes);
      timeMeta.append(timeLabel, timeValue);

      const distanceMeta = document.createElement("div");
      const distanceLabel = document.createElement("span");
      distanceLabel.textContent = t("route.distance");
      const distanceValue = document.createElement("strong");
      distanceValue.textContent = `${step.distanceKm.toFixed(1)} ${t("units.kilometer")}`;
      distanceMeta.append(distanceLabel, distanceValue);

      const bonusMeta = document.createElement("div");
      const bonusLabel = document.createElement("span");
      bonusLabel.textContent = isWalk ? t("route.legType") : t("route.bonusSplit");
      const bonusValue = document.createElement("strong");
      bonusValue.textContent = bonusText;
      bonusMeta.append(bonusLabel, bonusValue);

      meta.append(timeMeta, distanceMeta, bonusMeta);
      item.append(top, meta);
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
