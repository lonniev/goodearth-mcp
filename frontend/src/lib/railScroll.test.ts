// Run: node --experimental-strip-types --test src/lib/railScroll.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { centreOn, scrolls } from "./railScroll.ts";

// The real numbers, measured on a 390 px phone before this was fixed: thirteen
// rail items totalling 838 px, and the bar always sitting at scrollLeft 0.
const VIEW = 390, TOTAL = 838;

describe("bringing the current view into the bar", () => {
  it("centres an item from the middle of the strip", () => {
    // Tasks: left=452, width=55.
    assert.equal(centreOn(452, 55, VIEW, TOTAL), 285);
  });

  it("does not scroll past the left end for an early item", () => {
    // Favorites sits at the very start; centring it would ask for a negative
    // offset and leave a gap where the first item should be.
    assert.equal(centreOn(4, 60, VIEW, TOTAL), 0);
  });

  it("does not scroll past the right end for the last item", () => {
    // About: left=773, right=832. Centred it would overrun; the most this bar
    // can scroll is 838 - 390.
    assert.equal(centreOn(773, 59, VIEW, TOTAL), TOTAL - VIEW);
  });

  it("puts the item inside the window wherever it started", () => {
    // The property that actually matters, checked across the whole strip
    // rather than at three points somebody chose.
    for (let left = 0; left + 60 <= TOTAL; left += 7) {
      const at = centreOn(left, 60, VIEW, TOTAL);
      assert.ok(left - at >= -1 && left + 60 - at <= VIEW + 1,
        `an item at ${left} is still outside the window at scrollLeft ${at}`);
    }
  });

  it("is zero when everything already fits", () => {
    assert.equal(centreOn(100, 60, 800, 700), 0);
  });
});

describe("knowing when there is anything to scroll", () => {
  it("says yes for the phone bar", () => {
    assert.equal(scrolls(VIEW, TOTAL), true);
  });

  it("says no for the column rail on a wide screen", () => {
    // Vertical, so its scrollWidth equals its width. Moving scrollLeft there
    // would not be harmless, it would be meaningless.
    assert.equal(scrolls(200, 200), false);
  });
});
