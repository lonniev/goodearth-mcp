// Run: node --experimental-strip-types --test src/lib/gestureText.test.ts
//
// The text lives in a .tsx, which the node runner will not load, so this
// asserts the one thing about it that is a decision rather than a string: the
// pan line appears only once there is something to pan.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("src/components/GestureHint.tsx", "utf8");

describe("the gesture hint", () => {
  it("only offers panning once the reader is zoomed in", () => {
    assert.match(src, /isZoomed \? " · drag the middle to pan" : ""/);
  });

  it("waits long enough not to fire on a drag", () => {
    // The chart's own gestures start with MOVEMENT. A hold shorter than the
    // time it takes to begin a drag would pop the hint open mid-pan.
    const hold = /HOLD_MS = (\d+)/.exec(src);
    assert.ok(hold && Number(hold[1]) >= 350, `HOLD_MS is ${hold?.[1]}, too eager`);
  });

  it("cancels on movement rather than on time alone", () => {
    assert.match(src, /SLOP_PX/);
    assert.match(src, /onPointerMove/);
  });
});
