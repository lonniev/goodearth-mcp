// The undo stack. It stands in place of a confirmation dialog, so the one
// thing it may never do is claim a row is recoverable when it is not.

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
};

const { clear, drop, list, MAX_ENTRIES, push, since } = await import("./undo.ts");

const crop = (label: string) => ({
  kind: "crop" as const,
  blockId: "b1",
  label,
  item: { item_id: `i-${label}`, crop: label },
});

beforeEach(() => store.clear());

describe("the stack", () => {
  it("is empty before anything is removed", () => {
    assert.deepEqual(list(), []);
  });

  it("puts the newest removal first, because that is the one being undone", () => {
    push(crop("Zinnia"));
    push(crop("Tomato"));
    assert.deepEqual(list().map((e) => e.label), ["Tomato", "Zinnia"]);
  });

  it("keeps five and forgets the sixth", () => {
    for (const n of ["a", "b", "c", "d", "e", "f"]) push(crop(n));
    const got = list();
    assert.equal(got.length, MAX_ENTRIES);
    assert.deepEqual(got.map((e) => e.label), ["f", "e", "d", "c", "b"]);
  });

  it("gives two removals of the SAME row two entries", () => {
    // Remove, undo, remove again. Collapsing these would leave the second
    // removal with no way back.
    push(crop("Zinnia"));
    push(crop("Zinnia"));
    const [a, b] = list();
    assert.notEqual(a.id, b.id);
    assert.equal(list().length, 2);
  });

  it("drops one entry without touching the rest", () => {
    push(crop("Zinnia"));
    push(crop("Tomato"));
    const [top] = list();
    drop(top.id);
    assert.deepEqual(list().map((e) => e.label), ["Zinnia"]);
  });

  it("survives a reload", () => {
    // localStorage rather than sessionStorage: a mis-tap noticed after a
    // refresh is still a mis-tap.
    push(crop("Zinnia"));
    assert.equal(list()[0].label, "Zinnia");
  });

  it("clears", () => {
    push(crop("Zinnia"));
    clear();
    assert.deepEqual(list(), []);
  });
});

describe("unreadable storage", () => {
  it("reads as an empty stack rather than throwing on the page", () => {
    store.set("goodearth:undo:v1", "{not json");
    assert.deepEqual(list(), []);
  });

  it("discards a malformed entry rather than offering an undo that cannot run", () => {
    // The bar promises the row can come back. An entry with no item to save
    // would break that promise at the moment someone relied on it.
    store.set("goodearth:undo:v1", JSON.stringify([
      { id: "u1", kind: "crop", blockId: "b1", label: "Good", item: { a: 1 }, at: 1 },
      { id: "u2", kind: "crop", blockId: "b1", label: "No item" },
      "not an entry",
    ]));
    assert.deepEqual(list().map((e) => e.label), ["Good"]);
  });
});

describe("how long it has been sitting there", () => {
  it("is coarse, because the exact second is not the decision", () => {
    const now = 1_000_000_000;
    assert.equal(since(now - 30_000, now), "just now");
    assert.equal(since(now - 4 * 60_000, now), "4 min ago");
    assert.equal(since(now - 2 * 3_600_000, now), "2 h ago");
    assert.equal(since(now - 3 * 86_400_000, now), "3 d ago");
  });
});
