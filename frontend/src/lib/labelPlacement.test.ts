// Label placement — the flags must not land on each other.
//
// Run: node --experimental-strip-types --test src/lib/labelPlacement.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { placeLabels, type LabelItem, type PlaceOpts } from "./labelPlacement.ts";

const O: PlaceOpts = { left: 40, right: 900, top: 20, charW: 5.7, lineH: 10 };

function boxes(items: LabelItem[], o: PlaceOpts = O) {
  const p = placeLabels(items, o);
  return items.map((it, i) => {
    const chars = it.lines.reduce((m, l) => Math.max(m, l.length), 0);
    const w = chars * o.charW + 10;
    const h = it.lines.length * o.lineH;
    const x0 = p[i].flip ? it.cx - w : it.cx;
    const y1 = it.cy - p[i].stem;
    return { x0, x1: x0 + w, y0: y1 - h, y1, ...p[i] };
  });
}

const hit = (a: ReturnType<typeof boxes>[number], b: ReturnType<typeof boxes>[number]) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe("placeLabels", () => {
  it("separates flags that fall on nearly the same day", () => {
    // The real failure: a season bunches its events, and the old index-based
    // rotation put "Codling moth second flight" through "today · 2,271".
    const items: LabelItem[] = [
      { cx: 400, cy: 300, lines: ["Codling moth", "second flight"] },
      { cx: 404, cy: 296, lines: ["Cabbage maggot", "second flight"] },
      { cx: 409, cy: 292, lines: ["Grey squirrel", "nut caching"] },
    ];
    const b = boxes(items);
    for (let i = 0; i < b.length; i++)
      for (let j = i + 1; j < b.length; j++)
        assert.ok(!hit(b[i], b[j]), `labels ${i} and ${j} overlap`);
  });

  it("leaves an isolated flag close to its own point", () => {
    // Spreading is for crowding. A lone flag should not be flung upward.
    const [only] = placeLabels([{ cx: 200, cy: 300, lines: ["Spring peeper"] }], O);
    assert.equal(only.stem, 14);
  });

  it("keeps every anchor on its own day", () => {
    // The whole contract: labels move, the day does not. Placement returns
    // only a stem and a side, so cx can never be altered by it.
    const p = placeLabels([{ cx: 123, cy: 300, lines: ["a"] }], O);
    assert.deepEqual(Object.keys(p[0]).sort(), ["flip", "stem"]);
  });

  it("flips a label that would run off the right edge", () => {
    const [p] = placeLabels([{ cx: 880, cy: 300, lines: ["Median first frost"] }], O);
    assert.equal(p.flip, true);
  });

  it("does not flip a label with room to its right", () => {
    const [p] = placeLabels([{ cx: 100, cy: 300, lines: ["Median first frost"] }], O);
    assert.equal(p.flip, false);
  });

  it("stops climbing at the top of the plot rather than drawing off-chart", () => {
    // Twelve labels on one day cannot all be separated. Accepting an overlap
    // is better than putting one above the chart where it cannot be read.
    const items = Array.from({ length: 12 }, (_, i) => ({
      cx: 400, cy: 120, lines: [`event ${i}`],
    }));
    for (const b of boxes(items)) assert.ok(b.y0 >= O.top - O.lineH, "label escaped the plot");
  });

  it("returns a placement for every item, in the original order", () => {
    const items: LabelItem[] = [
      { cx: 700, cy: 100, lines: ["late"] },
      { cx: 100, cy: 200, lines: ["early"] },
    ];
    const p = placeLabels(items, O);
    assert.equal(p.length, 2);
    // Resolution runs left to right, but the caller indexes by its own order.
    assert.equal(p[1].stem, 14, "the earliest flag should be the unconstrained one");
  });
});
