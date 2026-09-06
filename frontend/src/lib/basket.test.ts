// Run: node --experimental-strip-types --test src/lib/basket.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addLabel, clampPage, holds, markChosen, pageCount, toggle } from "./basket.ts";

const bee = { taxonId: 1, name: "Common Eastern Bumble Bee" };
const oak = { taxonId: 2, name: "northern red oak" };

describe("a basket that survives searching and paging", () => {
  it("adds and removes by taxon id", () => {
    const one = toggle([], bee);
    assert.deepEqual(one.map((b) => b.taxonId), [1]);
    assert.deepEqual(toggle(one, bee), []);
  });

  it("keeps what was chosen under a previous search", () => {
    // THE case. A grower searches "bumble", ticks one, searches "oak", ticks
    // another, and adds both. A basket that reset on a new search would drop
    // the first and they would not find out until the end.
    const basket = toggle(toggle([], bee), oak);
    assert.deepEqual(basket.map((b) => b.name), [bee.name, oak.name]);
  });

  it("counts the same species found twice as one choice", () => {
    // "Common Eastern Bumble Bee" comes back under "bumble" and under "bee".
    const again = { taxonId: 1, name: "Common Eastern Bumble Bee", photo: "x.jpg" };
    assert.equal(toggle([bee], again).length, 0, "the second tap should UNtick it");
    assert.equal(holds([bee], 1), true);
  });

  it("marks a page of rows without re-querying anything", () => {
    const rows = [{ taxon_id: 1, name: "a" }, { taxon_id: 9, name: "b" }];
    assert.deepEqual(markChosen(rows, [bee]).map((r) => r.chosen), [true, false]);
  });

  it("does not confuse a missing taxon id with taxon zero", () => {
    const rows = [{ name: "no id" } as { taxon_id?: number; name: string }];
    assert.equal(markChosen(rows, [{ taxonId: 0, name: "zero" }])[0].chosen, false);
  });
});

describe("the pager", () => {
  it("counts pages of twenty", () => {
    assert.equal(pageCount(2196, 20), 110);
    assert.equal(pageCount(20, 20), 1);
    assert.equal(pageCount(21, 20), 2);
  });

  it("never reports zero pages", () => {
    // "Page 1 of 0" is a sentence about nothing, and the pager still renders.
    assert.equal(pageCount(0, 20), 1);
  });

  it("lands a stale page on the last real one", () => {
    // On page 40 of the insects, then a search cuts it to 13 results. Without
    // this the grower gets an empty page and no way to tell why.
    assert.equal(clampPage(40, 13, 20), 1);
    assert.equal(clampPage(40, 2196, 20), 40);
  });

  it("refuses a page below the first", () => {
    assert.equal(clampPage(0, 100, 20), 1);
    assert.equal(clampPage(-3, 100, 20), 1);
  });
});

describe("what the add button says", () => {
  it("says nothing about zero", () => {
    assert.equal(addLabel([], "Frogdale Farm"), "Choose some to add to Frogdale Farm");
  });

  it("counts one thing singular", () => {
    assert.equal(addLabel([bee], "Frogdale Farm"), "Add 1 thing to Frogdale Farm");
  });

  it("counts several", () => {
    assert.equal(addLabel([bee, oak], "Frogdale Farm"), "Add 2 things to Frogdale Farm");
  });
});
