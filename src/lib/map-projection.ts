import type { StationLike } from "../types.js";

export const MAP_TILE_SIZE = 256;
export const MAP_TILE_MAX_COUNT = 36;
export const MAP_TILE_MAX_ZOOM = 17;
export const MAP_TILE_MIN_ZOOM = 11;
export const MAP_TILE_URL_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MERCATOR_MAX_LATITUDE = 85.05112878;

export interface GeoBounds {
  maxLat: number;
  maxLng: number;
  minLat: number;
  minLng: number;
}

export interface ProjectionViewport {
  contentHeight: number;
  contentWidth: number;
  maxMercatorX: number;
  maxMercatorY: number;
  mercatorSpanX: number;
  mercatorSpanY: number;
  minMercatorX: number;
  minMercatorY: number;
  originX: number;
  originY: number;
  scale: number;
}

export interface MapTileDescriptor {
  height: number;
  href: string;
  width: number;
  x: number;
  y: number;
}

interface ExpandBoundsOptions {
  minLatSpan?: number;
  minLngSpan?: number;
  paddingRatio?: number;
}

interface ProjectStationsOptions {
  height?: number;
  padding?: number;
  width?: number;
}

export interface ProjectStationsResult<TStation extends StationLike> {
  bounds: GeoBounds | null;
  projected: Map<string | number, { x: number; y: number }>;
  viewport: ProjectionViewport | null;
  visibleStations: TStation[];
}

export function buildBounds(stations: Array<Pick<StationLike, "latitude" | "longitude">>): GeoBounds | null {
  if (stations.length === 0) return null;

  return stations.reduce(
    (acc, station) => ({
      minLat: Math.min(acc.minLat, Number(station.latitude)),
      maxLat: Math.max(acc.maxLat, Number(station.latitude)),
      minLng: Math.min(acc.minLng, Number(station.longitude)),
      maxLng: Math.max(acc.maxLng, Number(station.longitude)),
    }),
    {
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
    }
  );
}

export function clampLatitude(latitude: number) {
  return Math.max(-MERCATOR_MAX_LATITUDE, Math.min(MERCATOR_MAX_LATITUDE, latitude));
}

export function mercatorXFromLongitude(longitude: number) {
  return (longitude + 180) / 360;
}

export function mercatorYFromLatitude(latitude: number) {
  const clampedLatitude = clampLatitude(latitude);
  const radians = (clampedLatitude * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

export function chooseMapTileZoom(
  mercatorSpanX: number,
  mercatorSpanY: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const normalizedLngSpan = Math.max(mercatorSpanX, 1e-6);
  const normalizedLatSpan = Math.max(mercatorSpanY, 1e-6);
  const zoomForWidth = Math.log2(viewportWidth / (MAP_TILE_SIZE * normalizedLngSpan));
  const zoomForHeight = Math.log2(viewportHeight / (MAP_TILE_SIZE * normalizedLatSpan));
  const idealZoom = Math.min(zoomForWidth, zoomForHeight);

  if (!Number.isFinite(idealZoom)) return MAP_TILE_MIN_ZOOM;
  return Math.max(MAP_TILE_MIN_ZOOM, Math.min(MAP_TILE_MAX_ZOOM, Math.ceil(idealZoom)));
}

export function buildMapTileUrl(zoom: number, x: number, y: number) {
  return MAP_TILE_URL_TEMPLATE
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

export function buildProjectionViewport(bounds: GeoBounds, width: number, height: number, padding: number): ProjectionViewport {
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const minMercatorX = mercatorXFromLongitude(bounds.minLng);
  const maxMercatorX = mercatorXFromLongitude(bounds.maxLng);
  const minMercatorY = mercatorYFromLatitude(bounds.maxLat);
  const maxMercatorY = mercatorYFromLatitude(bounds.minLat);
  const mercatorSpanX = Math.max(maxMercatorX - minMercatorX, 1e-6);
  const mercatorSpanY = Math.max(maxMercatorY - minMercatorY, 1e-6);
  const scale = Math.min(usableWidth / mercatorSpanX, usableHeight / mercatorSpanY);
  const contentWidth = mercatorSpanX * scale;
  const contentHeight = mercatorSpanY * scale;
  const originX = padding + (usableWidth - contentWidth) / 2;
  const originY = padding + (usableHeight - contentHeight) / 2;

  return {
    contentHeight,
    contentWidth,
    maxMercatorX,
    maxMercatorY,
    mercatorSpanX,
    mercatorSpanY,
    minMercatorX,
    minMercatorY,
    originX,
    originY,
    scale,
  };
}

export function buildMapTileDescriptors(viewport: ProjectionViewport): MapTileDescriptor[] {
  let zoom = chooseMapTileZoom(
    viewport.mercatorSpanX,
    viewport.mercatorSpanY,
    viewport.contentWidth,
    viewport.contentHeight
  );
  let descriptors: MapTileDescriptor[] = [];

  while (zoom >= MAP_TILE_MIN_ZOOM) {
    const tileScale = 2 ** zoom;
    const tileMinX = Math.floor(viewport.minMercatorX * tileScale);
    const tileMaxX = Math.ceil(viewport.maxMercatorX * tileScale) - 1;
    const tileMinY = Math.floor(viewport.minMercatorY * tileScale);
    const tileMaxY = Math.ceil(viewport.maxMercatorY * tileScale) - 1;
    const tileColumns = tileMaxX - tileMinX + 1;
    const tileRows = tileMaxY - tileMinY + 1;

    if (tileColumns * tileRows <= MAP_TILE_MAX_COUNT || zoom === MAP_TILE_MIN_ZOOM) {
      descriptors = [];
      for (let tileX = tileMinX; tileX <= tileMaxX; tileX += 1) {
        for (let tileY = tileMinY; tileY <= tileMaxY; tileY += 1) {
          if (tileY < 0 || tileY >= tileScale || tileX < 0 || tileX >= tileScale) continue;

          descriptors.push({
            height: viewport.scale / tileScale,
            href: buildMapTileUrl(zoom, tileX, tileY),
            width: viewport.scale / tileScale,
            x: viewport.originX + (tileX / tileScale - viewport.minMercatorX) * viewport.scale,
            y: viewport.originY + (tileY / tileScale - viewport.minMercatorY) * viewport.scale,
          });
        }
      }

      break;
    }

    zoom -= 1;
  }

  return descriptors;
}

export function expandBounds(bounds: GeoBounds, options: ExpandBoundsOptions = {}): GeoBounds {
  const {
    minLatSpan = 0.01,
    minLngSpan = 0.015,
    paddingRatio = 0.22,
  } = options;

  const latCenter = (bounds.minLat + bounds.maxLat) / 2;
  const lngCenter = (bounds.minLng + bounds.maxLng) / 2;
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, minLatSpan);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, minLngSpan);
  const paddedLatSpan = latSpan * (1 + paddingRatio);
  const paddedLngSpan = lngSpan * (1 + paddingRatio);

  return {
    minLat: latCenter - paddedLatSpan / 2,
    maxLat: latCenter + paddedLatSpan / 2,
    minLng: lngCenter - paddedLngSpan / 2,
    maxLng: lngCenter + paddedLngSpan / 2,
  };
}

export function stationIsInsideBounds(
  station: Pick<StationLike, "latitude" | "longitude">,
  bounds: GeoBounds
) {
  const latitude = Number(station.latitude);
  const longitude = Number(station.longitude);
  return (
    latitude >= bounds.minLat &&
    latitude <= bounds.maxLat &&
    longitude >= bounds.minLng &&
    longitude <= bounds.maxLng
  );
}

export function projectStations<TStation extends StationLike>(
  stations: TStation[],
  focusStations: Array<StationLike | null | undefined> = stations,
  options: ProjectStationsOptions = {}
): ProjectStationsResult<TStation> {
  const {
    height = 700,
    padding = 70,
    width = 1000,
  } = options;

  if (stations.length === 0) {
    return {
      bounds: null as GeoBounds | null,
      projected: new Map<string | number, { x: number; y: number }>(),
      viewport: null,
      visibleStations: [] as TStation[],
    };
  }

  const sanitizedFocusStations = focusStations.filter(
    (station): station is StationLike => Boolean(station)
  );
  const rawBounds = buildBounds(sanitizedFocusStations) || buildBounds(stations);
  if (!rawBounds) {
    return {
      bounds: null as GeoBounds | null,
      projected: new Map<string | number, { x: number; y: number }>(),
      viewport: null,
      visibleStations: [] as TStation[],
    };
  }
  const bounds = expandBounds(rawBounds);
  const viewport = buildProjectionViewport(bounds, width, height, padding);

  const projected = new Map<string | number, { x: number; y: number }>();
  const projectionSources: StationLike[] = [...stations];

  for (const station of focusStations) {
    if (!station || projectionSources.some(entry => entry.code === station.code)) continue;
    projectionSources.push(station);
  }

  for (const station of projectionSources) {
    const x =
      viewport.originX +
      (mercatorXFromLongitude(Number(station.longitude)) - viewport.minMercatorX) * viewport.scale;
    const y =
      viewport.originY +
      (mercatorYFromLatitude(Number(station.latitude)) - viewport.minMercatorY) * viewport.scale;
    projected.set(station.code, { x, y });
  }

  const visibleStations = stations.filter(station => stationIsInsideBounds(station, bounds));

  return {
    bounds,
    projected,
    viewport,
    visibleStations,
  };
}
