// Run: node --experimental-strip-types --test src/lib/pestFilter.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOn, matches, NO_PEST_FILTER, summarise, type PestFilter } from "./pestFilter.ts";
import type { PestAssessment } from "./mcp.ts";
import type { SavedPest } from "./pestModels.ts";

const TODAY = new Date("2026-09-22T12:00:00");
const on = (over: Partial<PestFilter>): PestFilter => ({ ...NO_PEST_FILTER, ...over });

const pest = (over: Partial<SavedPest> = {}): SavedPest => ({
  id: "pe-1", pest: "Codling moth", regionId: "b1",
  stages: [{ stage: "first flight", gdd: 250 }],
  ...over,
} as SavedPest);

const vole = () => pest({ id: "pe-2", pest: "Vole", watch: true, stages: [] });

const seen = (stages: Partial<PestAssessment["stages"]>[0][] = []): PestAssessment =>
  ({ pest: "Codling moth", state: "active", note: "", stages } as PestAssessment);

const stage = (over: Record<string, unknown> = {}) => ({
  stage: "first flight", gdd: 250, reached: false, gdd_remaining: 100,
  projected_date: "2026-09-30", ...over,
} as PestAssessment["stages"][number]);

describe("whether anything is narrowing the list", () => {
  it("is off when nothing is set, and off for a half-typed number", () => {
    assert.equal(isOn(NO_PEST_FILTER), false);
    assert.equal(isOn(on({ dueDays: "  " })), false);
    assert.equal(isOn(on({ dueDays: "soon" })), false);
  });

  it("is on for zero, which is a real answer", () => {
    assert.equal(isOn(on({ dueDays: "0" })), true);
  });
});

describe("due within n days", () => {
  it("keeps a stage landing inside the window", () => {
    assert.equal(matches(pest(), seen([stage({ projected_date: "2026-09-30" })]),
      on({ dueDays: "10" }), TODAY), true);
  });

  it("drops one beyond it", () => {
    assert.equal(matches(pest(), seen([stage({ projected_date: "2026-10-30" })]),
      on({ dueDays: "10" }), TODAY), false);
  });

  it("ignores a stage already crossed — it is not DUE", () => {
    assert.equal(matches(pest(), seen([stage({ reached: true, projected_date: "2026-09-23" })]),
      on({ dueDays: "10" }), TODAY), false);
  });

  it("drops a creature with no model at all", () => {
    // A vole has no stage to be due. That is not "no", it is "not asked".
    assert.equal(matches(vole(), undefined, on({ dueDays: "30" }), TODAY), false);
  });
});

describe("crossed this season", () => {
  it("keeps a pest with a stage behind it and drops one without", () => {
    assert.equal(matches(pest(), seen([stage({ reached: true })]), on({ crossed: true }), TODAY), true);
    assert.equal(matches(pest(), seen([stage()]), on({ crossed: true }), TODAY), false);
  });
});

describe("watched, no model", () => {
  it("keeps the creature kept an eye on", () => {
    assert.equal(matches(vole(), undefined, on({ watchedOnly: true }), TODAY), true);
  });

  it("drops one that carries thresholds", () => {
    assert.equal(matches(pest(), seen([stage()]), on({ watchedOnly: true }), TODAY), false);
  });

  it("counts a row with no stages as watched, flag or no flag", () => {
    // The record has carried `watch` from the start, but rows added from the
    // nearby list before it did carry none.
    const bare = pest({ id: "pe-3", pest: "Deer", stages: [] });
    assert.equal(matches(bare, undefined, on({ watchedOnly: true }), TODAY), true);
  });
});

describe("saying what is on", () => {
  it("is a few words, or nothing at all", () => {
    assert.equal(summarise(NO_PEST_FILTER), "");
    assert.equal(summarise(on({ dueDays: "7", crossed: true })), "due ≤ 7d · crossed");
  });
});

describe("the page it sits on", () => {
  const view = () => readFileSync(new URL("../views/Pests.tsx", import.meta.url), "utf8");

  it("reads the whole block while a filter is on", () => {
    assert.match(view(), /pageSize: narrowed \? 200 : 20/);
  });

  it("says nothing the list already shows", () => {
    // "Nothing crossed or due in the next 10 days, across 7 pests."
    assert.doesNotMatch(view(), /data\?\.summary && <p/);
  });

  it("puts the reading time in the heading, once", () => {
    assert.match(view(), /What you're watching\$\{ranAt/);
    assert.match(view(), /<Provenance tool="goodearth_pest_threshold"[\s\S]{0,120}hideTime/);
  });

  it("opens the same card the nearby list opens", () => {
    assert.match(view(), /onRead=\{\(\) => setReading/);
    assert.match(view(), /<SpeciesCard taxonId=\{reading\}/);
  });

  it("names the catalogue section for what it answers", () => {
    assert.match(view(), /title="When they appear here"/);
    assert.doesNotMatch(view(), /title="Modelled stages"|title="Due on this ground"/);
  });
});
