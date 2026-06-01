import type { AppError } from "../types.js";

export const PLANNER_ERROR_CODES = Object.freeze({
  INSUFFICIENT_BUDGET: "insufficient_planner_budget",
  INVALID_INPUTS: "invalid_planner_inputs",
  INVALID_STATION_SELECTION: "invalid_station_selection",
  NO_BIKES_AT_START: "no_bikes_available_at_start",
});

export function createPlannerError(code: string, details: Record<string, unknown> = {}): AppError {
  const error = new Error(code) as AppError;
  error.code = code;
  error.details = details;
  return error;
}
