// Flags place a grower's own thresholds on a curve they already paid for. If
// the placement is wrong the whole calendar is wrong, and it is wrong
// silently — the flag still looks authoritative.
//
// Run: node --experimental-strip-types --test src/lib/ledgerFlags.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFlags } from "./ledgerFlags.ts";

// A season accumulating 10 GDD a day from Jan 1.
const N = 100;
const dates = Array.from({ length: N }, (_, i) =>
  new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
const mean = Array.from({ length: N }, (_, i) => i * 10);

const curve = {
  base_temp_f: 50,
  season_start: "2026-01-01",
  curve: { dates, cumulative_mean: mean },
  forecast: { dates: [], cumulative: [1000, 1010, 1020] },
  projection: { cumulative: [1030, 1040] },
} as never;

const planting = (o: Partial<Record<string, unknown>> = {}) => ({
  id: "p1", regionId: "r", crop: "Zinnia", gddTarget: 300,
  setOut: "2026-01-11", ...o,
}) as never;

describe("crop flags", () => {
  it("counts a target from set-out, not from Jan 1", () => {
    // Set out on day 10 (100 GDD in), target 300 → 400 GDD → day 40.
    const [f] = buildFlags(curve, [planting()], [], []);
    assert.equal(f.kind, "crop");
    assert.ok(Math.abs(f.index - 40) < 1.5, `index ${f.index}`);
  });

  it("marks a flag reached once the curve has passed it", () => {
    const [f] = buildFlags(curve, [planting({ gddTarget: 50 })], [], []);
    assert.equal(f.reached, true);
  });

  it("leaves a target out in the forecast unreached rather than clamping it", () => {
    // Recorded season ends at 990 GDD on day 99. Set out on day 10 (100 GDD
    // in) with a 910 target lands at 1010 — inside the forecast, past today.
    const [f] = buildFlags(curve, [planting({ gddTarget: 910 })], [], []);
    assert.equal(f.reached, false);
    assert.ok(f.index > 99, `index ${f.index} should sit past the recorded season`);
  });

  it("drops a target beyond even the projection rather than pinning it to the edge", () => {
    assert.equal(buildFlags(curve, [planting({ gddTarget: 99_999 })], [], []).length, 0);
  });
});

describe("base temperature", () => {
  it("flags a mismatch instead of silently misplacing the threshold", () => {
    // A threshold counted from 43 F cannot be read off a 50 F curve.
    const [f] = buildFlags(curve, [], [
      { id: "x", regionId: "r", pest: "Cabbage maggot", base_temp: 43,
        stages: [{ stage: "first flight", gdd: 300 }] } as never,
    ], []);
    assert.equal(f.baseMismatch, 43);
  });

  it("does not flag a matching base", () => {
    const [f] = buildFlags(curve, [], [
      { id: "x", regionId: "r", pest: "Corn borer", base_temp: 50,
        stages: [{ stage: "first flight", gdd: 300 }] } as never,
    ], []);
    assert.equal(f.baseMismatch, undefined);
  });
});

describe("wildlife", () => {
  it("places a heat-driven event on the heat axis", () => {
    const [f] = buildFlags(curve, [], [], [
      { id: "w", regionId: "r", species: "Monarch", event: "passage",
        driver: "heat", gdd: 500, base_temp: 50, emoji: "🦋" } as never,
    ]);
    assert.equal(f.kind, "wildlife");
    assert.ok(Math.abs(f.index - 50) < 1.5);
  });

  it("places a calendar event by date", () => {
    const [f] = buildFlags(curve, [], [], [
      { id: "w", regionId: "r", species: "Squirrel", event: "caching",
        driver: "calendar", typical_on: "02-10", emoji: "🐿️" } as never,
    ]);
    assert.equal(f.date, "2026-02-10");
    assert.ok(Math.abs(f.index - 40) < 1.5);
  });

  it("omits daylight events, which do not read the heat axis at all", () => {
    const got = buildFlags(curve, [], [], [
      { id: "w", regionId: "r", species: "Robin", event: "arrival",
        driver: "daylight", daylight_hours: 11.5, rising: true } as never,
    ]);
    assert.equal(got.length, 0);
  });
});

describe("assembly", () => {
  it("returns flags in date order so labels lay out left to right", () => {
    const got = buildFlags(curve,
      [planting({ id: "a", crop: "Late", gddTarget: 600, setOut: "2026-01-01" }),
       planting({ id: "b", crop: "Early", gddTarget: 100, setOut: "2026-01-01" })],
      [], []);
    assert.deepEqual(got.map((f) => f.label), ["Early", "Late"]);
  });

  it("returns nothing for an empty curve rather than throwing", () => {
    const empty = { ...curve, curve: { dates: [], cumulative_mean: [] } } as never;
    assert.deepEqual(buildFlags(empty, [planting()], [], []), []);
  });

  it("returns nothing when the grower has no models", () => {
    assert.deepEqual(buildFlags(curve, [], [], []), []);
  });
});
