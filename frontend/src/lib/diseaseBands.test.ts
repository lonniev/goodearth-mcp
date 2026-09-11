// Run: node --experimental-strip-types --test src/lib/diseaseBands.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bands } from "./diseaseBands.ts";
import type { DiseaseRiskResult, SeasonCurveResult } from "./mcp.ts";

/// A curve of `n` recorded days from Sep 1, plus `fc` forecast days.
function curve(n = 20, fc = 0): SeasonCurveResult {
  const dates = Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10));
  return {
    curve: { dates, cumulative_mean: dates.map((_, i) => i * 10) },
    ...(fc ? { forecast: { cumulative: Array.from({ length: fc }, (_, i) => (n + i) * 10) } } : {}),
  } as unknown as SeasonCurveResult;
}

const risk = (diseases: unknown[]) => ({ diseases } as unknown as DiseaseRiskResult);

const model = (over: Record<string, unknown>) => ({
  model: "botrytis", disease: "grey mould",
  last_period: null, next_period: null, ...over,
});

describe("placing a wet period on the chart's own axis", () => {
  it("turns a dated period into day indices", () => {
    const out = bands(curve(20), risk([
      model({ last_period: { from: "2026-09-03", to: "2026-09-06" } }),
    ]));
    assert.deepEqual(out, [
      { key: "botrytis-last", label: "grey mould", from: 2, to: 5, forecast: false },
    ]);
  });

  it("marks the one from the forecast as such", () => {
    const out = bands(curve(10, 10), risk([
      model({ next_period: { from: "2026-09-15", to: "2026-09-17" } }),
    ]));
    assert.equal(out[0].forecast, true);
    assert.equal(out[0].key, "botrytis-next");
  });

  it("reads an HOUR as happily as a DATE", () => {
    // Hutton's periods begin on a date, botrytis's on an hour.
    const out = bands(curve(20), risk([
      model({ last_period: { start: "2026-09-03T04:00", end: "2026-09-04T18:00" } }),
    ]));
    assert.deepEqual([out[0].from, out[0].to], [2, 3]);
  });

  it("gives a period with no stated end one day, not a band to nowhere", () => {
    const out = bands(curve(20), risk([model({ last_period: { from: "2026-09-05" } })]));
    assert.deepEqual([out[0].from, out[0].to], [4, 4]);
  });

  it("CLIPS a period that began before the chart starts", () => {
    // It still ended inside the window. A grower looking at a wet week should
    // not lose it because it began in March.
    const out = bands(curve(20), risk([
      model({ last_period: { from: "2026-08-20", to: "2026-09-03" } }),
    ]));
    assert.deepEqual([out[0].from, out[0].to], [0, 2]);
  });

  it("drops one that ended before the chart starts", () => {
    const out = bands(curve(20), risk([
      model({ last_period: { from: "2026-08-01", to: "2026-08-10" } }),
    ]));
    assert.deepEqual(out, []);
  });

  it("clips one running past the end of the timeline", () => {
    const out = bands(curve(10), risk([
      model({ last_period: { from: "2026-09-08", to: "2026-09-30" } }),
    ]));
    assert.deepEqual([out[0].from, out[0].to], [7, 9]);
  });
});

describe("how many bands there are", () => {
  it("is the LAST and the NEXT, never the whole season", () => {
    // Twenty apple-scab washes across one plot is weather wallpaper, and the
    // card below already carries the season's count.
    const out = bands(curve(20, 10), risk([
      model({
        season_count: 20,
        last_period: { from: "2026-09-02", to: "2026-09-03" },
        next_period: { from: "2026-09-22", to: "2026-09-24" },
      }),
    ]));
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((b) => b.forecast), [false, true]);
  });

  it("is in reading order, earliest first", () => {
    const out = bands(curve(30), risk([
      model({ model: "a", last_period: { from: "2026-09-20", to: "2026-09-21" } }),
      model({ model: "b", last_period: { from: "2026-09-04", to: "2026-09-05" } }),
    ]));
    assert.deepEqual(out.map((b) => b.from), [3, 19]);
  });

  it("is empty when nothing qualified, rather than a band of width nothing", () => {
    assert.deepEqual(bands(curve(20), risk([model({})])), []);
  });
});

describe("what it refuses to draw", () => {
  it("draws nothing without a curve to draw on", () => {
    assert.deepEqual(bands(null, risk([model({ last_period: { from: "2026-09-03" } })])), []);
  });

  it("draws nothing without an answer", () => {
    assert.deepEqual(bands(curve(20), null), []);
  });

  it("draws nothing on a curve with no dates", () => {
    const naked = { curve: { dates: [], cumulative_mean: [] } } as unknown as SeasonCurveResult;
    assert.deepEqual(bands(naked, risk([model({ last_period: { from: "2026-09-03" } })])), []);
  });
});
