// Run: node --experimental-strip-types --test src/lib/chartSpan.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spanTarget } from "./chartSpan.ts";
import { grabZone, spanWindow } from "./useChartZoom.ts";

// A season that started on New Year's Day and has run to 10 September, with
// the timeline stretched to the end of January by a dated winter task.
const ORIGIN = "2026-01-01";
const TODAY = 252;                      // 2026-09-10
const CTX = { today: TODAY, origin: ORIGIN, domLo: 0, domHi: 395 };

describe("what a span button asks for", () => {
  it("Season is the meteorological quarter, not the whole year", () => {
    // The regression this exists to stop: one button meant both, and a grower
    // in September asking for the season was handed January to December.
    const t = spanTarget("season", CTX);
    assert.notEqual(t, "full");
    if (t === "full") return;
    // Sep 1 – Nov 30 is 91 days.
    assert.equal(t.days, 91);
    // Centred on the QUARTER's midpoint, not on today. Sep 1 is day 243 from
    // a 1 January origin and Nov 30 is day 333.
    assert.equal(t.anchor, (243 + 333) / 2);
    assert.ok(t.anchor > CTX.today, "the middle of autumn is ahead of 10 September");
  });

  it("Annual is the whole timeline", () => {
    assert.equal(spanTarget("annual", CTX), "full");
  });

  it("every other span is that many days, centred on today", () => {
    assert.deepEqual(spanTarget("fortnight", CTX), { days: 14, anchor: TODAY });
    assert.deepEqual(spanTarget("week", CTX), { days: 7, anchor: TODAY });
    assert.deepEqual(spanTarget("month", CTX), { days: 30, anchor: TODAY });
    assert.deepEqual(spanTarget("quarter", CTX), { days: 90, anchor: TODAY });
  });

  it("counts against the DOMAIN, so a stretched timeline does not rescale it", () => {
    // The domain here is 396 days for a 260-day curve. Both answers are in
    // days, so neither moves when the timeline grows — the fraction is worked
    // out later, against the same total.
    const wide = spanTarget("week", { ...CTX, domHi: 700 });
    assert.deepEqual(wide, { days: 7, anchor: TODAY });
  });

  it("offsets the anchor when the domain does not start at zero", () => {
    // A task dated last winter pushes domLo negative, and every index on the
    // chart is measured from there.
    assert.deepEqual(spanTarget("week", { ...CTX, domLo: -20 }),
      { days: 7, anchor: TODAY + 20 });
  });

  it("falls back to the whole domain rather than inventing a window", () => {
    assert.equal(spanTarget("nonsense", CTX), "full");
    assert.equal(spanTarget("season", { ...CTX, origin: "" }), "full");
  });
});

describe("where that window lands", () => {
  const total = 396;

  it("puts today in the MIDDLE of a fortnight", () => {
    const w = spanWindow(14, total, TODAY);
    const lo = w.lo * (total - 1), hi = w.hi * (total - 1);
    assert.ok(Math.abs((lo + hi) / 2 - TODAY) < 0.5,
      `today at ${TODAY} is not centred in ${lo.toFixed(1)}..${hi.toFixed(1)}`);
    assert.ok(Math.abs((hi - lo) - 14) < 0.5, `the window is ${(hi - lo).toFixed(1)} days, not 14`);
  });

  it("slides in at the edge rather than showing past the end", () => {
    // A fortnight around the second-to-last day cannot be centred. The window
    // stays 14 days wide and sits against the end.
    const w = spanWindow(14, total, total - 2);
    assert.equal(w.hi, 1);
    assert.ok(Math.abs((w.hi - w.lo) * (total - 1) - 14) < 1);
  });

  it("never returns a window wider than the domain", () => {
    const w = spanWindow(9_999, total, TODAY);
    assert.deepEqual(w, { lo: 0, hi: 1 });
  });
});

describe("which gutter a drag began in", () => {
  // 46/740 left margin, and a plot that ends at B/H — which is NOT one number:
  // the season curve is 740x268 inline and 740x560 full screen.
  const INLINE = 232 / 268, FULL = 524 / 560;

  it("names the axis by where the finger landed", () => {
    assert.equal(grabZone(0.02, 0.5, INLINE), "y-axis");
    assert.equal(grabZone(0.5, 0.95, INLINE), "x-axis");
    assert.equal(grabZone(0.5, 0.5, INLINE), "plot");
  });

  it("follows the plot when the box grows", () => {
    // 0.90 down a FULL-SCREEN box is still the curve; down an inline box it is
    // the date axis. One constant for both is a drag on the line that silently
    // rescales the dates.
    assert.equal(grabZone(0.5, 0.90, INLINE), "x-axis");
    assert.equal(grabZone(0.5, 0.90, FULL), "plot");
    assert.equal(grabZone(0.5, 0.97, FULL), "x-axis");
  });

  it("defaults to the inline box, which is what most charts are", () => {
    assert.equal(grabZone(0.5, 0.95), "x-axis");
    assert.equal(grabZone(0.5, 0.5), "plot");
  });
});
