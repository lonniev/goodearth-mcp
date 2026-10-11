import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chipTap, hide, show, stillHidden } from "./hiddenPlots.ts";

describe("hiding plots from the map", () => {
  it("hides once and shows again", () => {
    assert.deepEqual(hide([], "a"), ["a"]);
    assert.deepEqual(hide(["a"], "a"), ["a"]);
    assert.deepEqual(show(["a", "b"], "a"), ["b"]);
  });
  it("forgets the ids of plots that are gone", () => {
    assert.deepEqual(stillHidden(["a", "gone"], ["a", "b"]), ["a"]);
  });
});

describe("a tap on a plot chip", () => {
  it("brings a hidden plot back", () => {
    assert.equal(chipTap(true, false, false), "show");
    assert.equal(chipTap(true, true, true), "show");
  });
  it("works another plot, frames the worked one, then asks", () => {
    assert.equal(chipTap(false, false, false), "work");
    assert.equal(chipTap(false, true, false), "frame");
    assert.equal(chipTap(false, true, true), "ask");
  });
});
