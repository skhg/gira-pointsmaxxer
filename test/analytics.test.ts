import assert from "node:assert/strict";
import test from "node:test";

import { hashAnalyticsAccountKey, parseAnalyticsEventRequest } from "../server/analytics.js";

test("analytics account hashes are stable and salted", () => {
  const left = hashAnalyticsAccountKey("gira-user-123", "secret-salt");
  const right = hashAnalyticsAccountKey("gira-user-123", "secret-salt");
  const differentSalt = hashAnalyticsAccountKey("gira-user-123", "other-salt");
  const differentUser = hashAnalyticsAccountKey("gira-user-999", "secret-salt");

  assert.equal(left, right);
  assert.notEqual(left, differentSalt);
  assert.notEqual(left, differentUser);
  assert.match(left || "", /^[a-f0-9]{64}$/u);
});

test("analytics event parser accepts the fixed schema only", () => {
  assert.deepEqual(
    parseAnalyticsEventRequest({
      eventName: "planner_run",
      language: "pt-PT",
      route: "/",
    }),
    {
      eventName: "planner_run",
      language: "pt-PT",
      route: "/",
    }
  );

  assert.throws(
    () =>
      parseAnalyticsEventRequest({
        eventName: "planner_run",
        extra: true,
        language: "en",
      }),
    /Unexpected analytics field/u
  );

  assert.throws(
    () =>
      parseAnalyticsEventRequest({
        eventName: "not_real",
        language: "en",
      }),
    /Unknown analytics event/u
  );
});
