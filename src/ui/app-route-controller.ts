import { CREDITS_ROUTE, PLANNER_ROUTE, normalizeAppPath, resolveAppRoute } from "../lib/app-routes.js";
import type { AppElements } from "./app-elements.js";
import type { AppState } from "./app-state.js";

interface AppRouteControllerOptions {
  drawNetwork: () => void;
  elements: Pick<
    AppElements,
    "appFooter" | "creditsHero" | "creditsPage" | "plannerHero" | "plannerPage" | "routeLinks"
  >;
  hideNetworkTooltip: () => void;
  state: Pick<AppState, "currentRoute">;
  translate: (key: string) => string;
}

export function createAppRouteController({
  drawNetwork,
  elements,
  hideNetworkTooltip,
  state,
  translate: t,
}: AppRouteControllerOptions) {
  function updateDocumentTitle(route: string) {
    document.title = route === CREDITS_ROUTE ? t("creditsPageTitle") : t("pageTitle");
  }

  function syncCanonicalRoute() {
    const currentPath = normalizeAppPath(globalThis.location?.pathname || PLANNER_ROUTE);
    const canonicalRoute = resolveAppRoute(currentPath);

    if (currentPath !== canonicalRoute) {
      globalThis.history.replaceState({}, "", canonicalRoute);
    }

    state.currentRoute = canonicalRoute;
    return canonicalRoute;
  }

  function renderRoute(options: { scrollTop?: boolean } = {}) {
    const { scrollTop = false } = options;
    const route = syncCanonicalRoute();
    const showingCredits = route === CREDITS_ROUTE;

    elements.plannerHero.hidden = showingCredits;
    elements.plannerPage.hidden = showingCredits;
    elements.appFooter.hidden = showingCredits;
    elements.creditsHero.hidden = !showingCredits;
    elements.creditsPage.hidden = !showingCredits;

    updateDocumentTitle(route);

    if (showingCredits) {
      hideNetworkTooltip();
    } else {
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
