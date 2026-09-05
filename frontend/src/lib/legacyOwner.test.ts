// One browser's legacy pile has one owner.
//
// Reported 2026-09-05: a grower signed out, generated a fresh nsec and npub,
// and was greeted by "Frogdale Farm, Panton, VT" — in Favorites, and in the
// calendar feed's offer to publish it. Scoping the blocks CACHE had not
// stopped it, because the new npub was not reading a stale cache. The
// migration had uploaded the previous patron's farm into their account, so the
// rows were genuinely theirs.

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const store = new Map<string, string>();
let throws = false;
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => { if (throws) throw new Error("blocked"); return store.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (throws) throw new Error("blocked"); store.set(k, v); },
  },
};

const { claimLegacy } = await import("./legacyOwner.ts");

const ALICE = "npub1alice";
const BOB = "npub1xcr";

beforeEach(() => { store.clear(); throws = false; });

describe("claiming the pile", () => {
  it("lets the first patron to ask lift it", () => {
    assert.equal(claimLegacy(ALICE), true);
  });

  it("REFUSES the next npub on the same browser", () => {
    // THE REPORTED BUG, in one line. Uploading here is a write into Bob's
    // account, so this is not a display leak — it is a transfer.
    claimLegacy(ALICE);
    assert.equal(claimLegacy(BOB), false);
  });

  it("still lets the owner retry a pass that died halfway", () => {
    // A partial migration leaves the pile in place on purpose so it can be
    // retried. That retry belongs to its owner and to nobody else — which is
    // what the per-npub sentinel was protecting, and that part was right.
    assert.equal(claimLegacy(ALICE), true);
    assert.equal(claimLegacy(ALICE), true);
    assert.equal(claimLegacy(ALICE), true);
  });

  it("refuses when nobody is signed in", () => {
    assert.equal(claimLegacy(""), false);
    assert.equal(store.size, 0, "an empty npub must not claim the pile either");
  });

  it("refuses rather than guesses when storage will not answer", () => {
    // Storage that cannot remember an owner cannot show the pile is ours.
    // Migrating nothing is the cheap failure; uploading someone else's farm
    // into this account is the expensive one.
    throws = true;
    assert.equal(claimLegacy(ALICE), false);
  });

  it("does not hand the pile back when the owner signs out and in again", () => {
    claimLegacy(ALICE);
    assert.equal(claimLegacy(BOB), false);
    assert.equal(claimLegacy(ALICE), true);
    assert.equal(claimLegacy(BOB), false);
  });
});
