// One browser, two npubs.
//
// Reported 2026-09-05 with a screenshot: a new patron signed in and the top
// bar read "Frogdale Farm, Panton, VT · 9.2 ha · 14 samples", with tonight's
// conditions for it — a farm they have never seen, and one every paid call
// they made was then about.
//
// The server was never at fault; its rows are npub-scoped. The browser cache
// was not. The comment on `activeKey` had already spelled the hazard out for
// the ACTIVE ID and it was never applied to the blocks themselves.

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const NPUB = "goodearth:patron_npub:v1";
const ALICE = "npub1alice";
const BOB = "npub10we";

const {
  EXAMPLE_REGION, deleteRegion, hydrate, listRegions, saveRegion,
} = await import("./regions.ts");

const block = (id: string, name: string) => ({
  id, name, baseTempF: 50,
  region: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
} as Parameters<typeof saveRegion>[0]);

const signIn = (npub: string) => store.set(NPUB, npub);

beforeEach(() => store.clear());

describe("one browser, two patrons", () => {
  it("does not show one patron's ground to another", () => {
    // THE REPORTED BUG.
    signIn(ALICE);
    saveRegion(block("map-mtgjwprp", "Frogdale Farm, Panton, VT"));
    assert.equal(listRegions()[0].name, "Frogdale Farm, Panton, VT");

    signIn(BOB);
    assert.deepEqual(listRegions().map((r) => r.name), [EXAMPLE_REGION.name]);
  });

  it("gives the first patron their ground back when they return", () => {
    // The cache exists so a grower sees their farm the instant the page opens.
    // Scoping must not cost that.
    signIn(ALICE);
    saveRegion(block("b1", "Frogdale Farm"));
    signIn(BOB);
    saveRegion(block("b2", "Bob's field"));
    signIn(ALICE);
    assert.deepEqual(listRegions().map((r) => r.name), ["Frogdale Farm"]);
  });

  it("keeps a deletion to the patron who made it", () => {
    signIn(ALICE);
    saveRegion(block("b1", "Frogdale Farm"));
    signIn(BOB);
    saveRegion(block("b1", "Bob's field"));
    deleteRegion("b1");
    assert.deepEqual(listRegions().map((r) => r.name), [EXAMPLE_REGION.name]);
    signIn(ALICE);
    assert.deepEqual(listRegions().map((r) => r.name), ["Frogdale Farm"]);
  });

  it("never reads the unscoped pile every patron once wrote to", () => {
    // That key is now only the migration's source. Whose ground is in it
    // cannot be known, which is exactly why it must not be shown.
    store.set("goodearth:regions:v1", JSON.stringify([block("old", "Somebody's farm")]));
    signIn(BOB);
    assert.deepEqual(listRegions().map((r) => r.name), [EXAMPLE_REGION.name]);
  });

  it("shows a signed-out reader nothing of anyone's", () => {
    signIn(ALICE);
    saveRegion(block("b1", "Frogdale Farm"));
    store.delete(NPUB);
    assert.deepEqual(listRegions().map((r) => r.name), [EXAMPLE_REGION.name]);
  });
});

describe("the server's answer is written down, including 'nothing'", () => {
  it("clears a stale cache when the record says the patron has no blocks", () => {
    // `hydrate([])` is the seeded case. Skipping the write — which is what the
    // sync used to do — left another patron's blocks standing.
    signIn(BOB);
    store.set(`goodearth:regions:v1:${BOB}`,
      JSON.stringify([block("map-mtgjwprp", "Frogdale Farm, Panton, VT")]));
    hydrate([]);
    assert.deepEqual(listRegions().map((r) => r.name), [EXAMPLE_REGION.name]);
  });

  it("writes the patron's own blocks over whatever was cached", () => {
    signIn(BOB);
    store.set(`goodearth:regions:v1:${BOB}`, JSON.stringify([block("x", "Stale")]));
    hydrate([block("b9", "Bob's field")]);
    assert.deepEqual(listRegions().map((r) => r.name), ["Bob's field"]);
  });
});
