// Run: node --experimental-strip-types --test src/lib/reorder.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dropIndex, mergeOrder, moveItem } from "./reorder.ts";

describe("moving a chiclet", () => {
  const L = ["a", "b", "c", "d"];

  it("moves one to the right and lands where it was dropped", () => {
    // The trap: splicing out first shifts every later index down, so a naive
    // implementation puts it one place short of where the finger let go.
    assert.deepEqual(moveItem(L, 0, 2), ["b", "c", "a", "d"]);
  });

  it("moves one to the left", () => {
    assert.deepEqual(moveItem(L, 3, 1), ["a", "d", "b", "c"]);
  });

  it("moves to the front and to the back", () => {
    assert.deepEqual(moveItem(L, 2, 0), ["c", "a", "b", "d"]);
    assert.deepEqual(moveItem(L, 0, 3), ["b", "c", "d", "a"]);
  });

  it("changes nothing when it did not move", () => {
    assert.deepEqual(moveItem(L, 1, 1), L);
  });

  it("never mutates what it was given", () => {
    const copy = [...L];
    moveItem(L, 0, 3);
    assert.deepEqual(L, copy);
  });

  it("clamps a drop past either end rather than losing the item", () => {
    assert.deepEqual(moveItem(L, 0, 99), ["b", "c", "d", "a"]);
    assert.deepEqual(moveItem(L, 3, -5), ["d", "a", "b", "c"]);
  });

  it("ignores a source index that is not in the list", () => {
    assert.deepEqual(moveItem(L, 9, 0), L);
  });
});

describe("which slot the finger is over", () => {
  const centers = [50, 150, 250, 350];

  it("takes the nearest centre", () => {
    assert.equal(dropIndex(centers, 55), 0);
    assert.equal(dropIndex(centers, 149), 1);
    assert.equal(dropIndex(centers, 349), 3);
  });

  it("resolves a gap to one side rather than stalling", () => {
    // A finger between two chiclets is closer to one of them. Treating the gap
    // as nobody's land makes a drag feel broken exactly where it is slowest.
    assert.equal(dropIndex(centers, 99), 0);
    assert.equal(dropIndex(centers, 101), 1);
  });

  it("clamps past either end", () => {
    assert.equal(dropIndex(centers, -1000), 0);
    assert.equal(dropIndex(centers, 1000), 3);
  });

  it("is zero when there is nothing to drop onto", () => {
    assert.equal(dropIndex([], 42), 0);
  });
});

describe("a saved order never decides what exists", () => {
  it("appends a measure added after the order was saved", () => {
    // THE LOAD-BEARING CASE. Humidity shipped after people had arranged their
    // charts. Trusting the saved list as the whole truth would have hidden it
    // from everyone who had ever dragged a chiclet — no error, nothing to
    // notice, just a measure that was never there.
    const saved = ["precip", "temp_max", "wind_max"];
    const all = ["temp_max", "temp_min", "precip", "wind_max", "humidity"];
    assert.deepEqual(mergeOrder(saved, all),
      ["precip", "temp_max", "wind_max", "temp_min", "humidity"]);
  });

  it("drops a name for something that no longer exists", () => {
    assert.deepEqual(mergeOrder(["gone", "b"], ["a", "b"]), ["b", "a"]);
  });

  it("survives a duplicate in the saved order", () => {
    assert.deepEqual(mergeOrder(["a", "a", "b"], ["a", "b"]), ["a", "b"]);
  });

  it("falls back to the built-in order when nothing was saved", () => {
    assert.deepEqual(mergeOrder([], ["a", "b", "c"]), ["a", "b", "c"]);
  });

  it("keeps every measure exactly once, whatever it was handed", () => {
    const all = ["a", "b", "c", "d"];
    const got = mergeOrder(["d", "d", "zz", "b"], all);
    assert.deepEqual([...got].sort(), [...all].sort());
    assert.equal(got.length, all.length);
  });
});
