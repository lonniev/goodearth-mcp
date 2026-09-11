// Run: node --experimental-strip-types --test src/lib/cropMatch.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claimedBy, growing, matches, norm } from "./cropMatch.ts";

describe("reducing a name to something two spellings meet on", () => {
  it("folds case and whitespace", () => {
    assert.equal(norm("  Calendula   Officinalis "), "calendula officinalis");
  });

  it("drops parentheticals and punctuation", () => {
    assert.equal(norm("Tomato (indeterminate)"), "tomato");
    assert.equal(norm("Grey mould / botrytis"), "grey mould botrytis");
  });

  it("is empty for nothing rather than throwing", () => {
    assert.equal(norm(""), "");
    assert.equal(norm("!!!"), "");
  });
});

describe("whether a model claims a planting", () => {
  it("matches a bare name to itself", () => {
    assert.equal(matches("calendula", ["calendula", "grape"]), true);
  });

  it("matches a BINOMIAL to the model's common name", () => {
    // The species picker writes "Calendula officinalis" onto the record. A
    // model that only said "calendula" would otherwise never join, which is
    // most of what a grower actually saves.
    assert.equal(matches("Calendula officinalis", ["calendula", "grape"]), true);
  });

  it("matches the other way round too", () => {
    assert.equal(matches("potato", ["potato", "tomato"]), true);
    assert.equal(matches("Tomato", ["tomato"]), true);
  });

  it("does not match an unrelated crop", () => {
    assert.equal(matches("garlic", ["apple", "crabapple"]), false);
    assert.equal(matches("calendula", ["potato", "tomato"]), false);
  });

  it("refuses an empty name rather than matching everything", () => {
    assert.equal(matches("", ["potato"]), false);
    assert.equal(matches("potato", []), false);
  });
});

const model = (name: string, crops: string[]) => ({ model: name, about: { crops } });

describe("splitting the models this ground grows for", () => {
  const MODELS = [
    model("hutton", ["potato", "tomato"]),
    model("mills", ["apple", "crabapple"]),
    model("botrytis", ["calendula", "cut flowers", "strawberry", "grape"]),
  ];

  it("keeps what the plantings claim and sets the rest aside", () => {
    // Frogdale: calendula and potatoes, no apples. Apple scab should not be
    // shouted at a flower farm.
    const { claimed, unclaimed } = claimedBy(MODELS, ["Calendula officinalis", "Potato"]);
    assert.deepEqual(claimed.map((m) => m.model), ["hutton", "botrytis"]);
    assert.deepEqual(unclaimed.map((m) => m.model), ["mills"]);
  });

  it("claims nothing when the record is empty, rather than claiming everything", () => {
    // A block with no plantings saved must not read as a block that grows all
    // of them — the card falls back to showing every model, which is a
    // decision for the caller and not a licence to invent a planting here.
    const { claimed, unclaimed } = claimedBy(MODELS, []);
    assert.equal(claimed.length, 0);
    assert.equal(unclaimed.length, 3);
  });

  it("names which of the grower's own crops a model claims", () => {
    assert.deepEqual(
      growing(["potato", "tomato"], ["Calendula officinalis", "Potato", "Tomato"]),
      ["Potato", "Tomato"],
    );
  });

  it("names them as the GROWER wrote them, not as the model did", () => {
    // "Calendula officinalis" is what is on their record; echoing back
    // "calendula" would quietly correct them.
    assert.deepEqual(growing(["calendula"], ["Calendula officinalis"]), ["Calendula officinalis"]);
  });
});
