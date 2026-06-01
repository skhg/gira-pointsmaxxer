import type { MessageValues } from "../types.js";

export const DEFAULT_CHALLENGE_MINUTES = 120;
export const FINISH_TIME_STEP_MINUTES = 5;
export const FINISH_TIME_REFRESH_MS = 1000 * 30;
export const MINIMUM_REMAINING_MINUTES = 5;

interface FinishTimeStatusBase {
  message: string;
  state: "error" | "ok" | "warning";
  valid: boolean;
}

interface FinishTimeStatusWithDeadline extends FinishTimeStatusBase {
  deadline: Date;
  remainingMinutes: number;
}

export type FinishTimeStatus = FinishTimeStatusBase | FinishTimeStatusWithDeadline;

interface FinishTimeStatusOptions {
  formatClockTime?: (date: Date) => string;
  formatRemainingTime?: (minutes: number) => string;
  messageFor?: (key: string, values?: MessageValues) => string;
  minimumRemainingMinutes?: number;
  now?: Date;
  value: string;
}

export function padTimeNumber(value: number) {
  return String(value).padStart(2, "0");
}

export function formatTimeInputValue(date: Date) {
  return `${padTimeNumber(date.getHours())}:${padTimeNumber(date.getMinutes())}`;
}

export function roundUpToStep(date: Date, stepMinutes: number) {
  const rounded = new Date(date);
  const hadSeconds = rounded.getSeconds() > 0 || rounded.getMilliseconds() > 0;
  rounded.setSeconds(0, 0);

  const remainder = rounded.getMinutes() % stepMinutes;
  if (remainder !== 0 || hadSeconds) {
    const minutesToAdd = remainder === 0 ? stepMinutes : stepMinutes - remainder;
    rounded.setMinutes(rounded.getMinutes() + minutesToAdd);
  }

  return rounded;
}

export function getLatestFinishTimeToday(now = new Date()) {
  const latest = new Date(now);
  latest.setHours(23, 55, 0, 0);
  return latest;
}

export function buildDefaultFinishTimeValue(now = new Date()) {
  const roundedNow = roundUpToStep(now, FINISH_TIME_STEP_MINUTES);
  const defaultFinish = new Date(roundedNow);
  defaultFinish.setMinutes(defaultFinish.getMinutes() + DEFAULT_CHALLENGE_MINUTES);

  const latestFinish = getLatestFinishTimeToday(now);
  if (defaultFinish > latestFinish) {
    defaultFinish.setTime(latestFinish.getTime());
  }

  return formatTimeInputValue(defaultFinish);
}

export function parseFinishTimeValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/u.exec(String(value || ""));
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return { hours, minutes };
}

export function getFinishTimeStatus(options: FinishTimeStatusOptions): FinishTimeStatus {
  const {
    value,
    now = new Date(),
    minimumRemainingMinutes = MINIMUM_REMAINING_MINUTES,
    messageFor = key => key,
    formatClockTime = date => date.toISOString(),
    formatRemainingTime = minutes => String(minutes),
  } = options;

  const parsed = parseFinishTimeValue(value);
  if (!parsed) {
    return {
      message: messageFor("finishTime.chooseToday"),
      state: "warning",
      valid: false,
    };
  }

  const deadline = new Date(now);
  deadline.setHours(parsed.hours, parsed.minutes, 0, 0);

  const remainingMinutes = (deadline.getTime() - now.getTime()) / 60000;

  if (remainingMinutes <= 0) {
    return {
      deadline,
      message: messageFor("finishTime.passedToday", {
        time: formatClockTime(deadline),
      }),
      remainingMinutes,
      state: "error",
      valid: false,
    };
  }

  if (remainingMinutes < minimumRemainingMinutes) {
    return {
      deadline,
      message: messageFor("finishTime.tooSoon", {
        minimum: minimumRemainingMinutes,
        remaining: formatRemainingTime(remainingMinutes),
        time: formatClockTime(deadline),
      }),
      remainingMinutes,
      state: "warning",
      valid: false,
    };
  }

  return {
    deadline,
    message: messageFor("finishTime.remainingUntil", {
      remaining: formatRemainingTime(remainingMinutes),
      time: formatClockTime(deadline),
    }),
    remainingMinutes,
    state: "ok",
    valid: true,
  };
}
