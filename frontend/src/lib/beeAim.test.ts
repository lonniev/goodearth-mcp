// The bees flew backwards, and it took someone watching the screen to notice.
//
// Run: node --experimental-strip-types --test src/lib/beeAim.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aimBee } from "./beeAim.ts";

/// Where the drawn nose ends up, given the glyph points west to begin with.
///
/// This is the whole question, so the test computes it rather than restating
/// the implementation: mirroring turns 180° into 0°, and the rotation is added
/// to whatever the mirror left. Normalised to (-180, 180].
function nose(tilt: number): number {
  const start = aimBee(tilt).mirror ? 0 : 180;
  const a = ((start + aimBee(tilt).rotate) % 360 + 360) % 360;
  return a > 180 ? a - 360 : a;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("a bee points where it is going", () => {
  for (const tilt of [0, 30, 45, 89, 90, 91, 135, 180, -30, -90, -135, -179]) {
    it(`heads ${tilt}° and its nose is at ${tilt}°`, () => {
      assert.ok(near(nose(tilt), tilt === -180 ? 180 : tilt),
        `tilt ${tilt} drew a nose at ${nose(tilt)}`);
    });
  }
});

describe("and never on its back", () => {
  // Rotation past a quarter turn reads as upside down. An insect banks; it
  // does not fly inverted. That is why this mirrors rather than spinning.
  for (let tilt = -180; tilt <= 180; tilt += 5) {
    it(`stays upright at ${tilt}°`, () => {
      assert.ok(Math.abs(aimBee(tilt).rotate) <= 90,
        `tilt ${tilt} rotated ${aimBee(tilt).rotate}°, which is belly-up`);
    });
  }
});

describe("the flight vector is not touched", () => {
  it("mirrors an eastbound bee rather than turning it round", () => {
    // The fault this replaces: the mirror was applied to the WESTBOUND branch,
    // so a bee crossing to the right showed its tail first.
    assert.equal(aimBee(0).mirror, true);
    assert.equal(aimBee(0).rotate, 0);
  });

  it("leaves a westbound bee unmirrored, since the glyph already faces west", () => {
    assert.equal(aimBee(180).mirror, false);
    assert.equal(aimBee(180).rotate, 0);
  });

  it("is a rendering decision only — nothing here returns a velocity", () => {
    assert.deepEqual(Object.keys(aimBee(45)).sort(), ["mirror", "rotate"]);
  });
});
