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
import { buildFlags } from "./ledgerFlags.ts";

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
