// The block proposed around a grower who has none.
//
// The arithmetic is the point: a pin in this service is a genuine circle —
// `parse_region` computes `area = πr²` and admits a sample when
// `hypot ≤ r` — so the radius has to fall out of the acreage rather than being
// picked. 500 m was the first guess in conversation and is 62 acres, six times
// what was meant.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_ACRES, HOME_RADIUS_M, proposeHomeBlock } from "./regions.ts";

const M2_PER_ACRE = 4046.8564224;
const acresOf = (r: number) => (Math.PI * r * r) / M2_PER_ACRE;

describe("the proposed first block", () => {
  it("is the acreage it claims, as a circle", () => {
    assert.ok(Math.abs(acresOf(HOME_RADIUS_M) - HOME_ACRES) < 0.5,
      `${HOME_RADIUS_M} m is ${acresOf(HOME_RADIUS_M).toFixed(1)} acres, not ${HOME_ACRES}`);
  });

  it("is big enough to cross more than one weather cell's worth of ground", () => {
    // The grid is 2 km. Ten acres (113 m) sits inside ONE cell, so the spread
    // across it — the whole claim this service makes — comes back nil on flat
    // ground. This does not fix that, but it stops the FIRST block being the
    // smallest one possible.
    assert.ok(HOME_RADIUS_M >= 150, `${HOME_RADIUS_M} m is too small to show a spread`);
  });

  it("is still plainly a small farm and not a county", () => {
    // The worked example is 13,344 acres. A proposal that large would teach a
    // first-time grower the wrong idea of what a block is.
    assert.ok(acresOf(HOME_RADIUS_M) < 100);
  });

  it("centres on the point it is given", () => {
    const made = proposeHomeBlock(44.31, -73.35);
    assert.notEqual(typeof made, "string");
    if (typeof made === "string") return;
    assert.deepEqual(made.region, { lat: 44.31, lon: -73.35, radius_m: HOME_RADIUS_M });
  });

  it("is named for what it is, since a grower renames it", () => {
    const made = proposeHomeBlock(44.31, -73.35);
    if (typeof made === "string") throw new Error(made);
    assert.equal(made.name, "Home block");
    assert.equal(made.id.startsWith("example"), false, "a proposal is real ground, not the example");
  });

  it("refuses a point that is not on the earth", () => {
    assert.equal(typeof proposeHomeBlock(999, 0), "string");
  });
});
