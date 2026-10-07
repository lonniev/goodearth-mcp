import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupByWhere, monthsBetween, monthSpan, searchFor, toChosen, type CompanionRow } from "./companions.ts";

const row = (over: Partial<CompanionRow>): CompanionRow => ({
  name: "x", where: "example", relation: "helps", why: "", basis: "tradition", cite: "", ...over,
});

describe("grouping keeps the service's rank inside each group", () => {
  it("this plot, then grown before, then examples; empty groups vanish", () => {
    const rows = [row({ name: "a", where: "example" }), row({ name: "b", where: "this_plot" }), row({ name: "c", where: "example" })];
    assert.deepEqual(groupByWhere(rows).map((g) => [g.where, g.rows.map((r) => r.name)]),
      [["this_plot", ["b"]], ["example", ["a", "c"]]]);
  });
});

describe("a tapped row becomes a Chosen only with a taxon", () => {
  it("carries the id and binomial", () => {
    assert.deepEqual(toChosen(row({ name: "dill", taxon_id: 7, scientific_name: "Anethum graveolens" })),
      { taxonId: 7, name: "dill", scientificName: "Anethum graveolens" });
  });
  it("is null without one, and the search uses the binomial", () => {
    const r = row({ name: "dill", scientific_name: "Anethum graveolens" });
    assert.equal(toChosen(r), null);
    assert.equal(searchFor(r), "Anethum graveolens");
    assert.equal(searchFor(row({ name: "dill" })), "dill");
  });
});

describe("bloom months as a span", () => {
  it("runs forward and wraps the year", () => {
    assert.deepEqual(monthsBetween(7, 9), [7, 8, 9]);
    assert.deepEqual(monthsBetween(11, 2), [11, 12, 1, 2]);
    assert.deepEqual(monthsBetween(5, 5), [5]);
  });
  it("refuses a month off the calendar", () => {
    assert.deepEqual(monthsBetween(0, 3), []);
    assert.deepEqual(monthsBetween(3, 13), []);
  });
  it("reads back as a span", () => {
    assert.equal(monthSpan([7, 8, 9]), "Jul–Sep");
    assert.equal(monthSpan([11, 12, 1, 2]), "Nov–Feb");
    assert.equal(monthSpan([5]), "May");
    assert.equal(monthSpan(undefined), "");
  });
});
