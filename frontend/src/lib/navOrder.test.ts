// A stored preference must never be able to hide a view that shipped later.
// Run: node --experimental-strip-types --test src/lib/navOrder.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyOrder, move } from "./navOrder.ts";

const items = [{ key: "a" }, { key: "b" }, { key: "c" }];

describe("applyOrder", () => {
  it("returns the default order when nothing is stored", () => {
    assert.deepEqual(applyOrder(items, null).map((i) => i.key), ["a", "b", "c"]);
  });

  it("applies a saved order", () => {
    assert.deepEqual(applyOrder(items, ["c", "a", "b"]).map((i) => i.key), ["c", "a", "b"]);
  });

  it("APPENDS a view that shipped after the order was saved", () => {
    // The failure this guards: a grower who reordered their rail in August
    // would never see a view added in September.
    assert.deepEqual(applyOrder(items, ["c", "a"]).map((i) => i.key), ["c", "a", "b"]);
  });

  it("drops a stored key whose view no longer exists", () => {
    assert.deepEqual(applyOrder(items, ["c", "gone", "a", "b"]).map((i) => i.key), ["c", "a", "b"]);
  });

  it("survives an order that shares nothing with the items", () => {
    assert.deepEqual(applyOrder(items, ["x", "y"]).map((i) => i.key), ["a", "b", "c"]);
  });
});

describe("move", () => {
  it("moves an item up", () => {
    assert.deepEqual(move(["a", "b", "c"], 1, 0), ["b", "a", "c"]);
  });

  it("moves an item down", () => {
    assert.deepEqual(move(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  });

  it("refuses to move past either end rather than wrapping", () => {
    assert.deepEqual(move(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
    assert.deepEqual(move(["a", "b", "c"], 2, 3), ["a", "b", "c"]);
  });

  it("is a no-op when nothing moves", () => {
    assert.deepEqual(move(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const src = ["a", "b", "c"];
    move(src, 0, 2);
    assert.deepEqual(src, ["a", "b", "c"]);
  });
});
