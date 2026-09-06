// Run: node --experimental-strip-types --test src/lib/migrateBlocks.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { liftVerdict } from "./liftVerdict.ts";

describe("when the one-time lift should stop trying", () => {
  it("is done when every block went up", () => {
    assert.equal(liftVerdict(3, 0, 3), "done");
  });

  it("settles when the rest were refused for good", () => {
    // THE BUG. A name clash can never be counted as landed, and only
    // `landed === total` stopped the lift — so this pass re-ran on every page
    // load, for as long as the clash existed. The branch meant to catch it
    // tested an error_code nothing has ever sent, so it never fired.
    assert.equal(liftVerdict(2, 1, 3), "settled");
    assert.equal(liftVerdict(0, 3, 3), "settled");
  });

  it("retries when something transient is still outstanding", () => {
    // The record being unreachable is worth coming back to; a name that is
    // already taken is not.
    assert.equal(liftVerdict(1, 0, 3), "retry");
    assert.equal(liftVerdict(0, 1, 3), "retry");
  });

  it("never settles a pass that had nothing to do", () => {
    // Marking the lift done on an empty run would strand whatever arrives on
    // this browser next.
    assert.equal(liftVerdict(0, 0, 0), "retry");
  });

  it("only 'done' is allowed to drop the local copy", () => {
    // A refused block is one this browser is still the only holder of.
    // Forgetting it would be losing it, which is why 'settled' is a separate
    // answer rather than a second way of saying done.
    assert.notEqual(liftVerdict(2, 1, 3), "done");
  });
});
