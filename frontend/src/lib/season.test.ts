// Run: node --experimental-strip-types --test src/lib/season.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seasonOf } from "./season.ts";

describe("the season the theme follows, on the plot being worked", () => {
  const oct = new Date("2026-10-15T12:00:00");
  it("is autumn in Maine, spring in Canberra and summer in Hawaii", () => {
    assert.equal(seasonOf(oct, 44.6), "autumn");
    assert.equal(seasonOf(oct, -35.3), "spring");
    assert.equal(seasonOf(oct, 19.7), "summer");
  });
  it("turns winter into summer across the equator", () => {
    const jan = new Date("2026-01-15T12:00:00");
    assert.equal(seasonOf(jan, 44.6), "winter");
    assert.equal(seasonOf(jan, -35.3), "summer");
  });
});
