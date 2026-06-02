import {
  CREDITS_ROUTE,
  PLANNER_ROUTE,
  STATS_ROUTE,
  normalizeAppPath,
  resolveAppRoute,
} from "../lib/app-routes.js";
import type { AppRoutePath } from "../types.js";
import type { AppElements } from "./app-elements.js";
import type { AppState } from "./app-state.js";

interface AppRouteControllerOptions {
  afterRender?: (route: AppRoutePath) => void;
  drawNetwork: () => void;
  elements: Pick<
    AppElements,
    | "appFooter"
    | "creditsHero"
    | "creditsPage"
    | "plannerHero"
    | "plannerPage"
    | "routeLinks"
    | "statsHero"
    | "statsPage"
  >;
  hideNetworkTooltip: () => void;
  state: Pick<AppState, "currentRoute">;
  translate: (key: string) => string;
}

export function createAppRouteController({
  afterRender,
  drawNetwork,
  elements,
  hideNetworkTooltip,
  state,
  translate: t,
}: AppRouteControllerOptions) {
  function updateDocumentTitle(route: AppRoutePath) {
    document.title =
      route === CREDITS_ROUTE
        ? t("creditsPageTitle")
        : route === STATS_ROUTE
          ? t("statsPageTitle")
          : t("pageTitle");
  }

  function syncCanonicalRoute(): AppRoutePath {
    const currentPath = normalizeAppPath(globalThis.location?.pathname || PLANNER_ROUTE);
    const canonicalRoute = resolveAppRoute(currentPath);

    if (currentPath !== canonicalRoute) {
      globalThis.history.replaceState({}, "", canonicalRoute);
    }

    state.currentRoute = canonicalRoute;
    return canonicalRoute;
  }

  function renderRoute(options: { scrollTop?: boolean } = {}): AppRoutePath {
    const { scrollTop = false } = options;
    const route = syncCanonicalRoute();
    const showingCredits = route === CREDITS_ROUTE;
    const showingStats = route === STATS_ROUTE;

    elements.plannerHero.hidden = showingCredits || showingStats;
    elements.plannerPage.hidden = showingCredits || showingStats;
    elements.appFooter.hidden = showingCredits || showingStats;
    elements.creditsHero.hidden = !showingCredits;
    elements.creditsPage.hidden = !showingCredits;
    elements.statsHero.hidden = !showingStats;
    elements.statsPage.hidden = !showingStats;

    updateDocumentTitle(route);

    if (showingCredits) {
      hideNetworkTooltip();
    } else if (!showingStats) {
      globalThis.requestAnimationFrame(() => {
        drawNetwork();
      });
    }

    if (scrollTop) {
      globalThis.scrollTo({
        top: 0,
        behavior: "auto",
      });
    }

    afterRender?.(route);
    return route;
  }

  function navigateToRoute(pathname: string) {
    const targetRoute = resolveAppRoute(pathname);
    const currentRoute = resolveAppRoute(globalThis.location?.pathname || PLANNER_ROUTE);
    if (
      currentRoute !== targetRoute ||
      normalizeAppPath(globalThis.location.pathname) !== targetRoute
    ) {
      globalThis.history.pushState({}, "", targetRoute);
    }

    renderRoute({ scrollTop: true });
  }

  function attachRouteLinkHandlers() {
    for (const link of elements.routeLinks) {
      link.addEventListener("click", event => {
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.defaultPrevented || mouseEvent.button !== 0) return;
        if (mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) {
          return;
        }

        mouseEvent.preventDefault();
        navigateToRoute(link.getAttribute("href") || PLANNER_ROUTE);
      });
    }
  }

  return {
    attachRouteLinkHandlers,
    renderRoute,
    updateDocumentTitle,
  };
}
