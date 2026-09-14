// A succession schedule becomes plantings: named, numbered, never doubled.
// Run: node --experimental-strip-types --test src/lib/successions.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseName, successionName, toPlantings } from "./successions.ts";
import type { Planting } from "./plantings.ts";
import type { SuccessionRow } from "./mcp";

const zinnia = {
  id: "pl-1", crop: "Zinnia", gddTarget: 900, setOut: "2026-05-20", baseTempF: 50,
  regionId: "b1", taxonId: 47604, commonName: "Zinnia",
} as Planting;

const row = (n: number, out: string, verdict: SuccessionRow["verdict"] = "finishes"): SuccessionRow =>
  ({ n, out, start_seed_indoors: null, finish: "2026-08-01", margin_days: 60, verdict, at_risk_of_early_frost: false });

describe("names", () => {
  it("strips a succession number to find the crop", () => {
    assert.equal(baseName("Zinnia · succession 4"), "Zinnia");
    assert.equal(baseName("Zinnia"), "Zinnia");
    assert.equal(successionName("Zinnia · succession 2", 7), "Zinnia · succession 7");
  });
});

describe("a schedule becomes plantings", () => {
  it("makes one planting per sowing, carrying the crop's own figures", () => {
    const { made } = toPlantings(zinnia, [row(1, "2026-06-01"), row(2, "2026-06-15")], [zinnia], "b1");
    assert.deepEqual(made.map((p) => [p.crop, p.setOut]), [
      ["Zinnia · succession 1", "2026-06-01"], ["Zinnia · succession 2", "2026-06-15"],
    ]);
    for (const p of made) {
      assert.equal(p.gddTarget, 900);
      assert.equal(p.baseTempF, 50);
      assert.equal(p.taxonId, 47604);
    }
  });

  it("numbers after the successions the crop already has", () => {
    const earlier = { ...zinnia, id: "pl-2", crop: "Zinnia · succession 3", setOut: "2026-05-30" };
    const { made } = toPlantings(zinnia, [row(1, "2026-07-01")], [zinnia, earlier], "b1");
    assert.equal(made[0].crop, "Zinnia · succession 4");
  });

  it("adds nothing twice: a sowing already on the ledger is skipped", () => {
    const there = { ...zinnia, id: "pl-3", crop: "Zinnia · succession 1", setOut: "2026-06-01" };
    const { made, skipped } = toPlantings(zinnia, [row(1, "2026-06-01"), row(2, "2026-06-15")], [zinnia, there], "b1");
    assert.equal(skipped, 1);
    assert.deepEqual(made.map((p) => p.setOut), ["2026-06-15"]);
  });

  it("offers only sowings that finish before the frost", () => {
    const { made } = toPlantings(zinnia, [row(1, "2026-06-01"), row(2, "2026-09-20", "wont_finish")], [zinnia], "b1");
    assert.deepEqual(made.map((p) => p.setOut), ["2026-06-01"]);
  });

  it("does not count another crop's successions", () => {
    const cosmos = { ...zinnia, id: "pl-9", crop: "Cosmos · succession 5" };
    const { made } = toPlantings(zinnia, [row(1, "2026-06-01")], [zinnia, cosmos], "b1");
    assert.equal(made[0].crop, "Zinnia · succession 1");
  });
});
