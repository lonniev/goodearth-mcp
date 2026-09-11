// Run: node --experimental-strip-types --test src/lib/soilTrack.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { soilTrack } from "./soilTrack.ts";

const days = (n: number, from = "2026-09-10") =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 10 + i)).toISOString().slice(0, 10),
    soil_f: 68 - i * 0.3,
  }));

const BASE = {
  as_of: "2026-09-10",
  threshold_f: 60,
  current_soil_f: 68,
  near_term: { days: days(16), crossing_date: null },
  typical: { median: "2026-09-26", earliest: "2026-09-17", latest: "2026-10-03" },
};

describe("laying the soil question on a line", () => {
  it("holds the normal window even when it sits past the forecast", () => {
    // The whole point of the picture. Oct 3 is day 23 from Sep 10; the
    // forecast stops at day 15. Fitting the domain to the forecast would crop
    // off the answer the reader came for.
    const t = soilTrack(BASE)!;
    assert.equal(t.origin, "2026-09-10");
    assert.equal(t.horizon, 15);
    assert.equal(t.typical!.latest.day, 23);
    assert.ok(t.hi >= 23, `domain stops at ${t.hi}, before the window ends`);
    assert.ok(t.lo <= 0, `domain starts at ${t.lo}, after today`);
  });

  it("places the normal window in order", () => {
    const t = soilTrack(BASE)!;
    assert.deepEqual(
      [t.typical!.earliest.day, t.typical!.median.day, t.typical!.latest.day],
      [7, 16, 23],
    );
  });

  it("marks a crossing only when the forecast actually has one", () => {
    assert.equal(soilTrack(BASE)!.crossing, null);
    const crossed = soilTrack({
      ...BASE, near_term: { days: days(16), crossing_date: "2026-09-19" },
    })!;
    assert.deepEqual(crossed.crossing, { day: 9, date: "2026-09-19" });
  });

  it("gives a flat fortnight room to be seen", () => {
    // Sixteen days at exactly 68 with a threshold of 60: the span is 8, so the
    // pad is 1.2 either side. Pinning the line to the top of the box would
    // read as missing data.
    const flat = soilTrack({
      ...BASE,
      near_term: { days: days(16).map((d) => ({ ...d, soil_f: 68 })), crossing_date: null },
    })!;
    assert.ok(flat.loF < 60 && flat.hiF > 68, `${flat.loF}..${flat.hiF} clips the line`);
  });

  it("still draws when there is no history to compare against", () => {
    const t = soilTrack({ ...BASE, typical: null })!;
    assert.equal(t.typical, null);
    assert.equal(t.horizon, 15);
  });

  it("refuses rather than drawing an empty box", () => {
    assert.equal(soilTrack({ ...BASE, as_of: "", near_term: null, typical: null }), null);
    assert.equal(soilTrack({ ...BASE, near_term: { days: [], crossing_date: null }, typical: null }), null);
  });

  it("keeps the threshold inside the temperature bounds", () => {
    // A threshold drawn outside the box is a dashed line nobody can see, and
    // it is the line the whole card is about.
    for (const threshold of [40, 60, 90]) {
      const t = soilTrack({ ...BASE, threshold_f: threshold })!;
      assert.ok(t.loF <= threshold && threshold <= t.hiF,
        `${threshold} falls outside ${t.loF}..${t.hiF}`);
    }
  });
});
