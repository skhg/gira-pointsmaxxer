import {
  DEFAULT_EMPTY_THRESHOLD,
  DEFAULT_OCCUPIED_THRESHOLD,
  classifyStation,
  finishBonusRatioAfterDock,
  occupiedRatioNow,
} from "../lib/planner.js";
import { buildMapTileDescriptors, projectStations } from "../lib/map-projection.js";
import type { MessageValues, Plan, Station, StationLike } from "../types.js";

interface TooltipPosition {
  x: number;
  y: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
}

interface NetworkMapControllerOptions {
  plannerRoute: string;
  svg: SVGSVGElement;
  tooltip: HTMLElement;
  translate: (key: string, values?: MessageValues) => string;
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getFocusStations(plan: Plan | null, stations: Station[]) {
  if (!plan) return stations;

  const seenCodes = new Set<string | number>();
  const focused: StationLike[] = [];

  const addStation = (station: StationLike | null | undefined) => {
    if (!station || seenCodes.has(station.code)) return;
    seenCodes.add(station.code);
    focused.push(station);
  };

  addStation(plan.startOrigin);
  addStation(plan.startStation);
  addStation(plan.endStation);

  for (const leg of plan.walkSteps ?? []) {
    addStation(leg.from);
    addStation(leg.to);
  }

  for (const leg of plan.route ?? []) {
    addStation(leg.from);
    addStation(leg.to);
  }

  return focused.length > 0 ? focused : stations;
}

function isProjectedPoint(point: ProjectedPoint | undefined): point is ProjectedPoint {
  return Boolean(point);
}

export function createNetworkMapController({
  plannerRoute,
  svg,
  tooltip,
  translate,
}: NetworkMapControllerOptions) {
  function hideTooltip() {
    tooltip.hidden = true;
    delete tooltip.dataset.stationCode;
  }

  function positionTooltip(position: TooltipPosition) {
    const stageRect = svg.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 220;
    const tooltipHeight = tooltip.offsetHeight || 96;
    const margin = 12;

    const left = Math.min(
      Math.max(position.x + margin, margin),
      Math.max(margin, stageRect.width - tooltipWidth - margin)
    );
    const top = Math.min(
      Math.max(position.y + margin, margin),
      Math.max(margin, stageRect.height - tooltipHeight - margin)
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function showTooltip(station: StationLike, position: TooltipPosition) {
    const bikes = Number(station.bikes ?? 0);
    const docks = Number(station.docks ?? 0);
    const normalizedStation = { bikes, docks };
    tooltip.dataset.stationCode = String(station.code);
    tooltip.innerHTML = `
      <strong>${escapeHtml(station.label || station.name || station.code)}</strong>
      <div>${escapeHtml(
        translate("network.tooltipOccupied", {
          bikes,
          docks,
        })
      )}</div>
      <div>${escapeHtml(
        translate("network.tooltipStartBonus", {
          value:
            occupiedRatioNow(normalizedStation) > DEFAULT_OCCUPIED_THRESHOLD
              ? translate("network.yes")
              : translate("network.no"),
        })
      )}</div>
      <div>${escapeHtml(
        translate("network.tooltipFinishBonus", {
          value:
            finishBonusRatioAfterDock(normalizedStation) > DEFAULT_EMPTY_THRESHOLD
              ? translate("network.yes")
              : translate("network.no"),
        })
      )}</div>
    `;
    tooltip.hidden = false;
    positionTooltip(position);
  }

  function drawNetwork({
    currentRoute,
    plannerHidden,
    plan,
    stations,
  }: {
    currentRoute: string;
    plannerHidden: boolean;
    plan: Plan | null;
    stations: Station[];
  }) {
    if (currentRoute !== plannerRoute || plannerHidden) {
      return;
    }

    const focusStations = getFocusStations(plan, stations);
    const { bounds, projected, viewport, visibleStations } = projectStations(stations, focusStations);
    const viewBox = svg.viewBox.baseVal;
    const viewBoxWidth = viewBox?.width || 1000;
    const viewBoxHeight = viewBox?.height || 700;

    svg.innerHTML = "";
    hideTooltip();

    svg.onclick = () => {
      hideTooltip();
    };

    if (bounds && viewport) {
      const clipId = `network-map-clip-${plan ? "focused" : "all"}`;
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
      clipPath.setAttribute("id", clipId);

      const clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      clipRect.setAttribute("x", String(viewport.originX));
      clipRect.setAttribute("y", String(viewport.originY));
      clipRect.setAttribute("width", String(viewport.contentWidth));
      clipRect.setAttribute("height", String(viewport.contentHeight));
      clipPath.appendChild(clipRect);
      defs.appendChild(clipPath);
      svg.appendChild(defs);

      const mapGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      mapGroup.setAttribute("clip-path", `url(#${clipId})`);

      for (const tile of buildMapTileDescriptors(viewport)) {
        const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
        image.setAttribute("x", String(tile.x));
        image.setAttribute("y", String(tile.y));
        image.setAttribute("width", String(tile.width));
        image.setAttribute("height", String(tile.height));
        image.setAttribute("preserveAspectRatio", "none");
        image.setAttribute("opacity", "0.9");
        image.setAttribute("href", tile.href);
        mapGroup.appendChild(image);
      }

      const wash = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      wash.setAttribute("x", String(viewport.originX));
      wash.setAttribute("y", String(viewport.originY));
      wash.setAttribute("width", String(viewport.contentWidth));
      wash.setAttribute("height", String(viewport.contentHeight));
      wash.setAttribute("fill", "rgba(255, 251, 244, 0.2)");
      mapGroup.appendChild(wash);

      svg.appendChild(mapGroup);

      const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      frame.setAttribute("x", String(viewport.originX));
      frame.setAttribute("y", String(viewport.originY));
      frame.setAttribute("width", String(viewport.contentWidth));
      frame.setAttribute("height", String(viewport.contentHeight));
      frame.setAttribute("rx", "22");
      frame.setAttribute("fill", "none");
      frame.setAttribute("stroke", "rgba(255,255,255,0.45)");
      frame.setAttribute("stroke-width", "2");
      svg.appendChild(frame);
    }

    const projectionLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    projectionLabel.setAttribute("x", "32");
    projectionLabel.setAttribute("y", "42");
    projectionLabel.setAttribute("fill", "rgba(23, 35, 20, 0.5)");
    projectionLabel.setAttribute("font-family", "IBM Plex Mono, monospace");
    projectionLabel.setAttribute("font-size", "14");
    projectionLabel.textContent = plan
      ? translate("network.zoomedLabel")
      : translate("network.projectedLabel");
    svg.appendChild(projectionLabel);

    if (plan?.route?.length) {
      const firstRouteLeg = plan.route[0]!;
      const lineGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const points = [firstRouteLeg.from, ...plan.route.map(leg => leg.to)]
        .map(station => projected.get(station.code))
        .filter(isProjectedPoint)
        .map(point => `${point.x},${point.y}`)
        .join(" ");

      const routeShadow = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      routeShadow.setAttribute("points", points);
      routeShadow.setAttribute("fill", "none");
      routeShadow.setAttribute("stroke", "rgba(13, 77, 57, 0.16)");
      routeShadow.setAttribute("stroke-width", "18");
      routeShadow.setAttribute("stroke-linecap", "round");
      routeShadow.setAttribute("stroke-linejoin", "round");
      lineGroup.appendChild(routeShadow);

      const routeLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      routeLine.setAttribute("points", points);
      routeLine.setAttribute("fill", "none");
      routeLine.setAttribute("stroke", "var(--route)");
      routeLine.setAttribute("stroke-width", "6");
      routeLine.setAttribute("stroke-linecap", "round");
      routeLine.setAttribute("stroke-linejoin", "round");
      lineGroup.appendChild(routeLine);

      svg.appendChild(lineGroup);
    }

    if (plan?.walkSteps?.length) {
      for (const walkStep of plan.walkSteps) {
        const walkPoints = [walkStep.from, walkStep.to]
          .map(station => projected.get(station.code))
          .filter(isProjectedPoint)
          .map(point => `${point.x},${point.y}`)
          .join(" ");

        if (!walkPoints) continue;

        const walkLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        walkLine.setAttribute("points", walkPoints);
        walkLine.setAttribute("fill", "none");
        walkLine.setAttribute("stroke", "rgba(217, 119, 6, 0.9)");
        walkLine.setAttribute("stroke-width", "4");
        walkLine.setAttribute("stroke-linecap", "round");
        walkLine.setAttribute("stroke-linejoin", "round");
        walkLine.setAttribute("stroke-dasharray", "12 10");
        svg.appendChild(walkLine);
      }
    }

    if (plan?.startOrigin) {
      const point = projected.get(plan.startOrigin.code);
      if (point) {
        const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        ring.setAttribute("cx", String(point.x));
        ring.setAttribute("cy", String(point.y));
        ring.setAttribute("r", "11");
        ring.setAttribute("fill", "rgba(255,255,255,0.85)");
        ring.setAttribute("stroke", "rgba(37, 99, 235, 0.28)");
        ring.setAttribute("stroke-width", "3");
        svg.appendChild(ring);

        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", String(point.x));
        dot.setAttribute("cy", String(point.y));
        dot.setAttribute("r", "5.5");
        dot.setAttribute("fill", "rgba(37, 99, 235, 0.95)");
        svg.appendChild(dot);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(point.x + 14));
        label.setAttribute("y", String(point.y - 12));
        label.setAttribute("fill", "rgba(37, 99, 235, 0.92)");
        label.setAttribute("font-family", "IBM Plex Mono, monospace");
        label.setAttribute("font-size", "12");
        label.textContent = translate("network.you");
        svg.appendChild(label);
      }
    }

    const routeCodes = new Set<string | number>();
    if (plan) {
      routeCodes.add(plan.startStation.code);
      routeCodes.add(plan.endStation.code);
    }
    if (plan?.route?.length) {
      routeCodes.add(plan.route[0]!.from.code);
      for (const leg of plan.route) routeCodes.add(leg.to.code);
    }

    visibleStations.forEach(station => {
      const point = projected.get(station.code);
      if (!point) return;

      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      const category = classifyStation(station);
      const isInRoute = routeCodes.has(station.code);
      const fill =
        category === "occupied"
          ? "var(--occupied)"
          : category === "empty"
            ? "var(--empty)"
            : "var(--neutral)";

      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", String(point.x));
      ring.setAttribute("cy", String(point.y));
      ring.setAttribute("r", isInRoute ? "13" : "10");
      ring.setAttribute("fill", "rgba(255,255,255,0.85)");
      ring.setAttribute(
        "stroke",
        isInRoute ? "rgba(13, 77, 57, 0.28)" : "rgba(23, 35, 20, 0.1)"
      );
      ring.setAttribute("stroke-width", isInRoute ? "4" : "2");
      group.appendChild(ring);

      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(point.x));
      dot.setAttribute("cy", String(point.y));
      dot.setAttribute("r", isInRoute ? "8" : "6.5");
      dot.setAttribute("fill", fill);
      group.appendChild(dot);

      if (isInRoute) {
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(point.x + 14));
        label.setAttribute("y", String(point.y - 12));
        label.setAttribute("fill", "rgba(23, 35, 20, 0.88)");
        label.setAttribute("font-family", "IBM Plex Mono, monospace");
        label.setAttribute("font-size", "12");
        label.textContent = station.displayCode || station.code;
        group.appendChild(label);
      }

      const fixedTooltipPosition = {
        x: (point.x / viewBoxWidth) * svg.clientWidth,
        y: (point.y / viewBoxHeight) * svg.clientHeight,
      };

      group.addEventListener("mousemove", event => {
        showTooltip(station, {
          x: event.offsetX,
          y: event.offsetY,
        });
      });

      group.addEventListener("mouseleave", () => {
        hideTooltip();
      });

      group.addEventListener("click", event => {
        event.stopPropagation();
        const isSameStationOpen =
          !tooltip.hidden && tooltip.dataset.stationCode === station.code;

        if (isSameStationOpen) {
          hideTooltip();
          return;
        }

        showTooltip(station, fixedTooltipPosition);
      });

      group.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        showTooltip(station, fixedTooltipPosition);
      });

      svg.appendChild(group);
    });
  }

  return {
    drawNetwork,
    hideTooltip,
  };
}
