import type { AppRoutePath } from "../types.js";

export const PLANNER_ROUTE = "/";
export const CREDITS_ROUTE = "/credits";
export const STATS_ROUTE = "/stats";
export const APP_ROUTES = [PLANNER_ROUTE, CREDITS_ROUTE, STATS_ROUTE] as const;

export function normalizeAppPath(pathname = PLANNER_ROUTE) {
  const normalized = String(pathname || PLANNER_ROUTE).replace(/\/+$/u, "") || PLANNER_ROUTE;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function isAppRoutePath(pathname: string): pathname is AppRoutePath {
  return (APP_ROUTES as readonly string[]).includes(normalizeAppPath(pathname));
}

export function resolveAppRoute(pathname = PLANNER_ROUTE): AppRoutePath {
  const normalized = normalizeAppPath(pathname);
  return isAppRoutePath(normalized) ? normalized : PLANNER_ROUTE;
}
