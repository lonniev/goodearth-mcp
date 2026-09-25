import { test } from "node:test";
import assert from "node:assert/strict";
import { clockDay, clockTime } from "./clock.ts";

// One instant, read on two clocks: the zone the patron picks is the zone shown.
const AT = "2026-09-25T22:30:00Z";

test("the viewer's clock follows the chosen zone", () => {
  assert.notEqual(clockTime(AT, "America/New_York"), clockTime(AT, "Asia/Tokyo"));
  assert.match(clockTime(AT, "America/New_York"), /6:30/);
  assert.match(clockTime(AT, "Asia/Tokyo"), /7:30/);
});

test("the day turns over where the viewer is, not where the browser is", () => {
  assert.equal(clockDay(AT, "America/New_York"), "Sep 25");
  assert.equal(clockDay(AT, "Asia/Tokyo"), "Sep 26");
  assert.equal(clockDay(new Date(AT), "UTC"), "Sep 25");
});
