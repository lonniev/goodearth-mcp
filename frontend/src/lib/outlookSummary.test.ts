// The outlook summary: arithmetic that must not flatter or alarm.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareOutlook, departure } from "./outlookSummary.ts";
import type { AlmanacResult, Measure } from "./mcp.ts";

const measure = (m: Partial<Measure>): Measure => ({
  unit: "°F", actual: [], forecast: [], normal: null, accumulates: false, ...m,
});

/// 20 days of season, then 10 of forecast. The normal band spans BOTH.
function almanac(measures: Partial<Record<string, Measure>>): AlmanacResult {
  return {
    success: true, as_of: "2026-09-03", season_start: "2026-04-01",
    dates: Array.from({ length: 20 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`),
    forecast_dates: Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`),
    measures: measures as AlmanacResult["measures"],
    normals_span_years: 10,
  } as AlmanacResult;
}

/// A band whose season half is warm and whose forecast tail is cool — the
/// shape that catches code comparing against the wrong window.
const splitBand = (seasonMean: number, tailMean: number) => [
  ...Array.from({ length: 20 }, () => ({ min: seasonMean - 5, mean: seasonMean, max: seasonMean + 5 })),
  ...Array.from({ length: 10 }, () => ({ min: tailMean - 5, mean: tailMean, max: tailMean + 5 })),
];

describe("compareOutlook — the window it compares against", () => {
  it("compares the forecast to the SAME days' normal, not the season's", () => {
    // Ten days at 70 °F. The season averaged 85; these ten days normally do 68.
    // Against the season it reads 15 below normal — a fabricated cold snap.
    const data = almanac({
      temp_max: measure({ forecast: Array(10).fill(70), normal: splitBand(85, 68) }),
    });
    const [line] = compareOutlook(data);
    assert.equal(Math.round(line.normal), 68);
    assert.equal(Math.round(line.delta), 2);
  });

  it("totals what accumulates and averages what does not", () => {
    const data = almanac({
      precip: measure({
        unit: "in", accumulates: true,
        forecast: Array(10).fill(0.1),
        normal: splitBand(0.05, 0.05),
      }),
      temp_max: measure({ forecast: Array(10).fill(70), normal: splitBand(70, 70) }),
    });
    const rain = compareOutlook(data).find((l) => l.label === "Rain")!;
    const temp = compareOutlook(data).find((l) => l.label === "Daily high")!;
    // Ten days of a tenth of an inch is an inch, not a tenth.
    assert.equal(Number(rain.forecast.toFixed(2)), 1);
    assert.equal(Number(rain.normal.toFixed(2)), 0.5);
    // A temperature over ten days is still a temperature.
    assert.equal(temp.forecast, 70);
  });
});

describe("compareOutlook — gaps and absences", () => {
  it("ignores days upstream could not report rather than reading them as zero", () => {
    const data = almanac({
      temp_max: measure({
        forecast: [70, null, 70, null, 70, 70, 70, 70, 70, 70],
        normal: splitBand(70, 70),
      }),
    });
    const [line] = compareOutlook(data);
    assert.equal(line.forecast, 70, "a missing day is not a 0 °F day");
  });

  it("says nothing about a measure with no forecast at all", () => {
    const data = almanac({ temp_max: measure({ forecast: [], normal: splitBand(70, 70) }) });
    assert.deepEqual(compareOutlook(data), []);
  });

  it("says nothing when there is no normal to compare against", () => {
    const data = almanac({ temp_max: measure({ forecast: Array(10).fill(70), normal: null }) });
    assert.deepEqual(compareOutlook(data), []);
  });

  it("omits day length, which is astronomy and has no interesting normal", () => {
    const data = almanac({
      daylight: measure({ unit: "h", forecast: Array(10).fill(12), normal: splitBand(12, 12) }),
    });
    assert.deepEqual(compareOutlook(data), []);
  });
});

describe("departure — how a line reads in words", () => {
  const data = almanac({
    temp_max: measure({ forecast: Array(10).fill(78), normal: splitBand(70, 70) }),
  });

  it("reports the departure with its direction and size", () => {
    const [line] = compareOutlook(data);
    assert.equal(departure(line), "above normal by 8 °F");
  });

  it("calls a small departure normal, on a per-unit threshold", () => {
    // 1 °F is nothing; a tenth of an inch over ten days is nothing too.
    assert.equal(departure({ label: "Daily high", forecast: 70.6, normal: 70, delta: 0.6, unit: "°F", decimals: 0 }), "about normal");
    assert.equal(departure({ label: "Rain", forecast: 0.6, normal: 0.5, delta: 0.1, unit: "in", decimals: 2 }), "about normal");
    assert.equal(departure({ label: "Rain", forecast: 1.5, normal: 0.5, delta: 1, unit: "in", decimals: 2 }), "well above normal by 1.00 in");
  });

  it("recommends nothing", () => {
    // Good Earth computes against your ground; it does not publish agronomy.
    const said = compareOutlook(data).map(departure).join(" ").toLowerCase();
    for (const word of ["should", "recommend", "advise", "sow", "you ought", "plant now"]) {
      assert.ok(!said.includes(word), `the departure must not say "${word}"`);
    }
  });
});

describe("compareOutlook — the scale the reader asked for", () => {
  it("converts a temperature line and its NORMAL, and takes the delta after", () => {
    // The failure this guards: converting the departure itself. A 4 °F
    // departure is 2.2 °C, not 36.
    const data = almanac({
      temp_max: measure({
        forecast: [68, 68, 68],
        normal: Array(3).fill({ mean: 50 }),
        unit: "°F",
      }),
    });
    const f = compareOutlook(data, "F").find((l) => l.label === "Daily high")!;
    const c = compareOutlook(data, "C").find((l) => l.label === "Daily high")!;
    assert.equal(f.delta, 18);
    assert.equal(Math.round(c.forecast), 20);
    assert.equal(Math.round(c.normal), 10);
    assert.equal(Math.round(c.delta), 10);
    assert.equal(c.unit, "°C");
  });

  it("leaves rain alone — an inch is an inch in either scale", () => {
    const data = almanac({
      precip: measure({ forecast: [1, 1], normal: [{ mean: 0.5 }, { mean: 0.5 }], unit: "in", accumulates: true }),
    });
    const f = compareOutlook(data, "F").find((l) => l.label === "Rain")!;
    const c = compareOutlook(data, "C").find((l) => l.label === "Rain")!;
    assert.deepEqual(f, c);
  });
});
