export const PLANNER_ROUTE = "/";
export const CREDITS_ROUTE = "/credits";

export function normalizeAppPath(pathname = PLANNER_ROUTE) {
  const normalized = String(pathname || PLANNER_ROUTE).replace(/\/+$/u, "") || PLANNER_ROUTE;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function resolveAppRoute(pathname = PLANNER_ROUTE) {
  return normalizeAppPath(pathname) === CREDITS_ROUTE ? CREDITS_ROUTE : PLANNER_ROUTE;
}
