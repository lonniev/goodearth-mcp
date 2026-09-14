// What a planting gave, and when — and that only its first cut is a timing.
// Run: node --experimental-strip-types --test src/lib/harvests.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeHarvest, lastUnit, makeHarvest, summarize } from "./harvests.ts";
import { toObservations, type FieldReport } from "./reports.ts";
import type { Planting } from "./plantings.ts";

const zinnia = { id: "pl-1", crop: "Zinnia · succession 2", setOut: "2026-06-01", gddTarget: 1200 } as Planting;
const cut = (on: string, extra: Partial<FieldReport> = {}): FieldReport => {
  const r = makeHarvest(zinnia, "b1", { on, amount: 40, unit: "stems" }, { today: "2026-09-14" });
  assert.ok(typeof r !== "string", String(r));
  return { ...r, ...extra };
};
const day = (iso: string) => iso.slice(5);

describe("recording a cut", () => {
  it("joins the cut to its planting and carries what it is measured against", () => {
    const r = cut("2026-08-12");
    assert.equal(r.tag, "harvest");
    assert.equal(r.ref, "pl-1");
    assert.equal(r.crop, "Zinnia · succession 2");
    assert.equal(r.gddTarget, 1200);
    assert.equal(r.setOut, "2026-06-01");
    assert.deepEqual([r.amount, r.unit], [40, "stems"]);
  });

  it("keeps the id the form gave it, so a repeated tap updates one cut", () => {
    const a = makeHarvest(zinnia, "b1", { on: "2026-08-12" }, { id: "hv-x", today: "2026-09-14" });
    const b = makeHarvest(zinnia, "b1", { on: "2026-08-12" }, { id: "hv-x", today: "2026-09-14" });
    assert.equal((a as FieldReport).id, (b as FieldReport).id);
  });

  it("refuses a cut from the future, before set-out, or of a negative amount", () => {
    const t = { today: "2026-09-14" };
    assert.equal(typeof makeHarvest(zinnia, "b1", { on: "2026-09-15" }, t), "string");
    assert.equal(typeof makeHarvest(zinnia, "b1", { on: "2026-05-30" }, t), "string");
    assert.equal(typeof makeHarvest(zinnia, "b1", { on: "2026-08-01", amount: -3 }, t), "string");
    assert.equal(typeof makeHarvest(zinnia, "b1", { on: "" }, t), "string");
  });

  it("records a cut with no amount — the date alone is worth having", () => {
    const r = makeHarvest(zinnia, "b1", { on: "2026-08-12" }, { today: "2026-09-14" });
    assert.ok(typeof r !== "string");
    assert.equal(r.amount, undefined);
  });
});

describe("what a planting gave", () => {
  it("counts cuts, keeps the first and last, and adds up per unit", () => {
    const s = summarize([
      cut("2026-08-20"), cut("2026-08-12"),
      cut("2026-08-27", { amount: 2.5, unit: "lb" }),
      cut("2026-08-30", { ref: "pl-2" }),
      { ...cut("2026-08-12"), tag: "note" },
    ]).get("pl-1")!;
    assert.equal(s.cuts, 3);
    assert.deepEqual([s.first, s.last], ["2026-08-12", "2026-08-27"]);
    assert.deepEqual(s.totals, [{ unit: "stems", amount: 80 }, { unit: "lb", amount: 2.5 }]);
    assert.equal(describeHarvest(s, day), "3 cuts · first 08-12 · 80 stems, 2.5 lb");
  });

  it("says one cut plainly", () => {
    const s = summarize([cut("2026-08-12")]).get("pl-1")!;
    assert.equal(describeHarvest(s, day), "1 cut · 08-12 · 40 stems");
  });

  it("offers the unit last used for the crop", () => {
    assert.equal(lastUnit([cut("2026-08-12"), cut("2026-08-20", { unit: "bunches" })], zinnia.crop), "bunches");
    assert.equal(lastUnit([cut("2026-08-12")], "Dahlia"), undefined);
  });
});

describe("a first cut calibrates; the rest are yield", () => {
  it("sends only a planting's first cut to the calibration model, as the harvest stage", () => {
    const obs = toObservations([cut("2026-08-20"), cut("2026-08-12"), cut("2026-08-27")]);
    assert.equal(obs.length, 1);
    assert.deepEqual(
      { kind: obs[0].kind, on: obs[0].observed_on, stage: obs[0].stage, target: obs[0].gdd_target, from: obs[0].set_out },
      { kind: "stage", on: "2026-08-12", stage: "harvest", target: 1200, from: "2026-06-01" },
    );
  });

  it("cannot calibrate a cut of a planting with no heat target", () => {
    assert.equal(toObservations([cut("2026-08-12", { gddTarget: undefined })]).length, 0);
  });
});
