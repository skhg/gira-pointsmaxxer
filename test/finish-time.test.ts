import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDefaultFinishTimeValue,
  getFinishTimeStatus,
} from "../src/lib/finish-time.js";
import type { MessageValues } from "../src/types.js";

function messageFor(key: string, values: MessageValues = {}) {
  const templates = {
    "finishTime.chooseToday": "choose today",
    "finishTime.passedToday": `${values.time ?? ""} passed`,
    "finishTime.remainingUntil": `${values.remaining ?? ""} until ${values.time ?? ""}`,
    "finishTime.tooSoon":
      `${values.remaining ?? ""} until ${values.time ?? ""}; need ${values.minimum ?? ""}`,
  };

  return templates[key as keyof typeof templates];
}

test("default finish time rounds up and caps at the latest slot today", () => {
  const value = buildDefaultFinishTimeValue(new Date("2026-06-01T22:58:30"));
  assert.equal(value, "23:55");
});

test("finish time status distinguishes invalid, expired, too-soon, and valid deadlines", () => {
  const baseOptions = {
    formatClockTime: date =>
      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    formatRemainingTime: minutes => `${Math.floor(minutes)} min`,
    messageFor,
  };

  assert.deepEqual(
    getFinishTimeStatus({
      ...baseOptions,
      now: new Date("2026-06-01T12:00:00"),
      value: "",
    }),
    {
      message: "choose today",
      state: "warning",
      valid: false,
    }
  );

  const expired = getFinishTimeStatus({
    ...baseOptions,
    now: new Date("2026-06-01T12:10:00"),
    value: "12:00",
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.state, "error");
  assert.equal(expired.message, "12:00 passed");

  const tooSoon = getFinishTimeStatus({
    ...baseOptions,
    now: new Date("2026-06-01T12:00:00"),
    value: "12:03",
  });
  assert.equal(tooSoon.valid, false);
  assert.equal(tooSoon.state, "warning");
  assert.equal(tooSoon.message, "3 min until 12:03; need 5");

  const valid = getFinishTimeStatus({
    ...baseOptions,
    now: new Date("2026-06-01T12:00:00"),
    value: "13:20",
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.state, "ok");
  assert.equal(valid.message, "80 min until 13:20");
});
