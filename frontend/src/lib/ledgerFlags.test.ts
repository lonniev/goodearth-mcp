// The chart must survive rows that carry no dates.
//
// Run: node --experimental-strip-types --test src/lib/ledgerFlags.test.ts
//
// A watched pest is stored as {pest: "Vole", watch: true} — no stages, because
// there is no degree-day figure for a creature you simply keep an eye out for.
// buildFlags looped `for (const st of m.stages)`, which throws on a row that
// has none, and a throw during render unmounts the tree: the grower saw a
// blank background where their whole season had been.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFlags, taskFlags } from "./ledgerFlags.ts";

/// The shape HeatLedger hands in — a fortnight of accumulating heat.
const N = 14;
const curve = {
  season_start: "2026-05-01",
  base_temp_f: 50,
  curve: {
    dates: Array.from({ length: N }, (_, i) => `2026-05-${String(i + 1).padStart(2, "0")}`),
    cumulative_mean: Array.from({ length: N }, (_, i) => i * 20),
  },
} as never;

describe("buildFlags", () => {
  it("does not throw on a watched pest that has no stages", () => {
    const pests = [{ pest: "Vole", watch: true, id: "1", regionId: "b" }] as never;
    assert.doesNotThrow(() => buildFlags(curve, [], pests, []));
  });

  it("does not throw on a roster creature that has no driver", () => {
    const wildlife = [{ species: "Great blue heron", role: "friend", id: "1", regionId: "b" }] as never;
    assert.doesNotThrow(() => buildFlags(curve, [], [], wildlife));
  });

  it("does not throw on a presence planting with no target or set-out", () => {
    const plantings = [{ id: "1", crop: "Columbine", regionId: "b" }] as never;
    assert.doesNotThrow(() => buildFlags(curve, plantings, [], []));
  });

  it("still flags the rows that DO carry dates", () => {
    const plantings = [
      { id: "1", crop: "Columbine", regionId: "b" },                                  // presence
      { id: "2", crop: "Dahlia", gddTarget: 100, setOut: "2026-05-01", regionId: "b" }, // real
    ] as never;
    const flags = buildFlags(curve, plantings, [], []);
    assert.equal(flags.filter((f) => f.kind === "crop").length, 1);
    assert.equal(flags.find((f) => f.kind === "crop")?.label, "Dahlia");
  });

  it("keeps the good stages of a pest whose other stage is malformed", () => {
    const pests = [{
      pest: "Codling moth", id: "1", regionId: "b",
      stages: [{ stage: "first flight", gdd: 120 }, { stage: "broken" }],
    }] as never;
    const flags = buildFlags(curve, [], pests, []);
    assert.equal(flags.filter((f) => f.kind === "pest").length, 1);
  });
});

describe("dates on the timeline", () => {
  /// A curve that gains 20 GDD a day from May 1, so a threshold's crossing
  /// date is arithmetic rather than a guess.
  const dated = {
    base_temp_f: 50,
    season_start: "2026-05-01",
    curve: {
      dates: Array.from({ length: 14 }, (_, i) => `2026-05-${String(i + 1).padStart(2, "0")}`),
      cumulative_mean: Array.from({ length: 14 }, (_, i) => i * 20),
    },
  } as never;

  it("a heat-driven mark is anchored by the curve, not stated", () => {
    const pests = [{
      pest: "Codling moth", id: "1", regionId: "b",
      stages: [{ stage: "first flight", gdd: 100 }],
    }] as never;
    const [f] = buildFlags(dated, [], pests, []);
    assert.equal(f.anchor, "heat");
    assert.equal(f.begin, "2026-05-06");   // 100 GDD at 20/day from May 1
    assert.equal(f.end, undefined);        // an instant: a bar of zero width
  });

  it("a planting is a bar: stated on the left, computed on the right", () => {
    // This is the case that shows the whole model in one mark.
    const plantings = [
      { id: "1", crop: "Dahlia", gddTarget: 100, setOut: "2026-05-03", regionId: "b" },
    ] as never;
    const [f] = buildFlags(dated, plantings, [], []);
    assert.equal(f.anchor, "date");
    assert.equal(f.begin, "2026-05-03", "left end is the day it went in");
    // Target counts FROM set-out: 40 GDD banked by May 3, + 100 = 140 → May 8.
    assert.equal(f.end, "2026-05-08", "right end is when the heat arrives");
  });

  it("a stated wildlife date stands whatever the heat did", () => {
    const wildlife = [{
      species: "Grey squirrel", event: "nut caching", driver: "calendar",
      typical_on: "05-09", id: "1", regionId: "b",
    }] as never;
    const [f] = buildFlags(dated, [], [], wildlife);
    assert.equal(f.anchor, "date");
    assert.equal(f.begin, "2026-05-09");
  });

  it("every flag carries a begin", () => {
    // The chart positions by date now. A flag without one has nowhere to go.
    const plantings = [{ id: "1", crop: "Dahlia", gddTarget: 100, setOut: "2026-05-03", regionId: "b" }] as never;
    const pests = [{ pest: "Codling moth", id: "2", regionId: "b", stages: [{ stage: "flight", gdd: 60 }] }] as never;
    for (const f of buildFlags(dated, plantings, pests, [])) {
      assert.ok(f.begin, `${f.label} has no begin`);
    }
  });
});

describe("taskFlags", () => {
  it("puts a task on its stated day, whatever the heat did", () => {
    // The owner's example: "Buy seeds Jan 13 2027" belongs on Jan 13 2027.
    const [f] = taskFlags([{ id: "1", title: "Buy seeds", due: "2027-01-13" }]);
    assert.equal(f.begin, "2027-01-13");
    assert.equal(f.anchor, "date");
    assert.equal(f.gdd, undefined, "a task has no place on the heat axis");
  });

  it("leaves done work off — the chart is what is coming", () => {
    assert.equal(taskFlags([{ id: "1", title: "Done", due: "2026-05-01", done: true }]).length, 0);
  });

  it("skips a task with no date, rather than inventing one", () => {
    assert.equal(taskFlags([{ id: "1", title: "Someday" }]).length, 0);
  });

  it("survives junk without throwing", () => {
    assert.doesNotThrow(() => taskFlags([null, undefined] as never));
  });
});
