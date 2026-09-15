// The foraging bees, and the switch that turns them off.
// Run: node --experimental-strip-types --test src/lib/beeFlight.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activityOf, beeCount, flightSize } from "./beeFlight.ts";

describe("how many bees fly", () => {
  it("none when the grower has turned them off, whatever the weather", () => {
    for (const mood of ["flying", "quiet", "unknown", "closed"] as const) {
      assert.equal(flightSize(false, mood, 1), 0, mood);
    }
  });

  it("the weather's count when they are on", () => {
    assert.equal(flightSize(true, "flying", activityOf(85)), 6);
    assert.equal(flightSize(true, "quiet", activityOf(50)), 1);
    assert.equal(flightSize(true, "closed", 1), 0);
    assert.equal(beeCount("unknown", 0.4), 2);
  });
});

describe("the flight honours the switch everywhere it counts", () => {
  it("Bees.tsx sizes the flight only through flightSize", () => {
    const src = readFileSync(new URL("../components/Bees.tsx", import.meta.url), "utf8")
      .replace(/\/\/.*$/gm, "");
    // Counting from the mood directly is how the effect ignored the switch:
    // the restart saw zero bees, the spawn saw the weather's number.
    assert.doesNotMatch(src, /\bbeeCount\(/);
    assert.equal(src.match(/\bflightSize\(/g)?.length, 2);
  });
});
