// Run: node --experimental-strip-types --test src/lib/peerPage.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pageKey, peerOf, WARM_AFTER_MS } from "./peerPage.ts";

describe("the page a reader is most likely to open next", () => {
  it("pairs the two readings of the same week", () => {
    assert.equal(peerOf("ledger"), "almanac");
    assert.equal(peerOf("almanac"), "ledger");
  });

  it("guesses nothing from a page that leads nowhere in particular", () => {
    for (const v of ["plots", "crops", "pests", "wildlife", "todo", "references", "welcome"]) {
      assert.equal(peerOf(v), null, v);
    }
  });

  it("waits before warming, so the page in front wins the network", () => {
    assert.ok(WARM_AFTER_MS > 0);
  });
});

describe("the key a warm fills and a view reads", () => {
  it("is the same string from both sides", () => {
    // The whole value of warming rests on this one equality. Disagree by a
    // character and the warm fills a slot nobody reads: the page is exactly
    // as slow as before, and the grower pays twice for the privilege.
    const ground = { id: "blk_1", baseTempF: 50 };
    assert.equal(pageKey("ledger", ground), "ledger|blk_1|50");
    assert.equal(pageKey("almanac", ground), "almanac|blk_1");
  });

  it("separates two base temperatures on the same ground", () => {
    // Same plot, different question — one curve counts heat above 50 and the
    // other above 40, and handing over the wrong one would misdate every
    // planting on the page.
    assert.notEqual(
      pageKey("ledger", { id: "blk_1", baseTempF: 50 }),
      pageKey("ledger", { id: "blk_1", baseTempF: 40 }),
    );
  });

  it("ignores the base temperature for the sky, which has none", () => {
    assert.equal(
      pageKey("almanac", { id: "blk_1", baseTempF: 50 }),
      pageKey("almanac", { id: "blk_1", baseTempF: 40 }),
    );
  });
});
