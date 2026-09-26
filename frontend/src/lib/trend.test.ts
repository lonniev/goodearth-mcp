// Run: node --experimental-strip-types --test src/lib/trend.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { trendLift } from "./trend.ts";

describe("trendLift", () => {
  it("lifts the warmest day most and the coolest not at all", () => {
    assert.deepEqual(trendLift([60, 70, 65], 4), [0, 4, 2]);
  });
  it("never exceeds the budget", () => {
    const lift = trendLift([12, 90, 45, 33, 71], 4);
    assert.ok(lift.every((p) => p >= 0 && p <= 4));
  });
  it("leaves a flat fortnight flat", () => {
    assert.deepEqual(trendLift([55, 55, 55], 4), [0, 0, 0]);
  });
  it("does not nudge a day it has no reading for", () => {
    assert.deepEqual(trendLift([50, null, 60], 4), [0, 0, 4]);
  });
});
