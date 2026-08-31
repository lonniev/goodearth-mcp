// A preference saved before a new one existed must not leave that new one
// missing. Run: node --experimental-strip-types --test src/lib/prefs.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
};

const { readPrefs, writePrefs, DEFAULTS } = await import("./prefs.ts");

beforeEach(() => store.clear());

describe("prefs", () => {
  it("defaults the bees on — they are an instrument, not a decoration", () => {
    assert.equal(readPrefs().bees, true);
    assert.equal(DEFAULTS.bees, true);
  });

  it("round-trips a change", () => {
    writePrefs({ bees: false });
    assert.equal(readPrefs().bees, false);
  });

  it("merges over the defaults, so a preference added later is present", () => {
    // What an older save looks like: an object missing today's keys.
    store.set("goodearth:prefs:v1", JSON.stringify({}));
    assert.equal(readPrefs().bees, true);
  });

  it("falls back to the defaults on unreadable storage", () => {
    store.set("goodearth:prefs:v1", "{not json");
    assert.deepEqual(readPrefs(), DEFAULTS);
  });

  it("never hands back the shared DEFAULTS object to be mutated", () => {
    const a = readPrefs();
    a.bees = false;
    assert.equal(DEFAULTS.bees, true);
  });
});
