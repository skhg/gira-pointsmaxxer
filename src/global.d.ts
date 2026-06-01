import type { LocationSnapshot } from "./types.js";

declare global {
  var __GIRA_GRAND_PRIX_MOCK_LOCATION__:
    | Partial<LocationSnapshot>
    | undefined;
}

export {};
