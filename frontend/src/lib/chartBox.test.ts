// The Almanac's charts fit their cards on a phone, with labels that read.
// Run: node --experimental-strip-types --test src/lib/chartBox.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_W, MIN_W, drawWidth } from "./chartBox.ts";
import { spaceTicks } from "./dateTicks.ts";
import { grabZone } from "./useChartZoom.ts";

describe("the drawing is as wide as its box", () => {
  it("draws at the measured width, one unit to a pixel", () => {
    assert.equal(drawWidth(318), 318);
    assert.equal(drawWidth(1180.4), 1180);
  });

  it("uses the wide default only before the box is measured", () => {
    assert.equal(drawWidth(0), DEFAULT_W);
  });

  it("never draws narrower than a readable plot; a tinier box scales it down", () => {
    assert.equal(drawWidth(200), MIN_W);
  });

  it("holds no minimum width that could push a chart past its card", () => {
    // A phone is 390 px. This chart held min-w-[520px] and ran 229 px past
    // the right edge of every card on the Almanac.
    const src = readFileSync(new URL("../components/MeasureChart.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(src, /min-w-\[\d+px\]/);
  });
});

describe("date labels at phone width", () => {
  const W = 300, L = 46, R = W - 14, days = 257;
  const x = (d: number) => L + (d * (R - L)) / days;
  const months = ["JAN 2026", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP"]
    .map((label, m) => ({ d: m * 30.4, label, major: m === 0 }));
  const width = (label: string) => label.length * 6.4;

  it("keeps no two labels on top of each other", () => {
    const kept = spaceTicks(months, (t) => x(t.d));
    for (let i = 1; i < kept.length; i++) {
      const prev = kept[i - 1], cur = kept[i];
      assert.ok(x(cur.d) >= x(prev.d) + width(prev.label),
        `${prev.label} runs into ${cur.label}`);
    }
    assert.ok(kept.length >= 4, `only ${kept.length} labels survived`);
  });

  it("keeps the year's first month before the months beside it", () => {
    assert.equal(spaceTicks(months, (t) => x(t.d))[0].label, "JAN 2026");
  });

  it("drops nothing on a laptop, where every month fits", () => {
    const wide = (d: number) => 46 + (d * 680) / days;
    assert.equal(spaceTicks(months, (t) => wide(t.d)).length, months.length);
  });
});

describe("the drag zones follow the drawing", () => {
  it("names the whole 46 px gutter as the value axis on a narrow chart", () => {
    // 30 px in on a 300 px chart is inside the gutter. The 740-wide default
    // fraction put the boundary at 18 px, so it read as the plot.
    assert.equal(grabZone(30 / 300, 0.5, 118 / 150, 46 / 300), "y-axis");
    assert.equal(grabZone(30 / 300, 0.5), "plot");
  });
});
