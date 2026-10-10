import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromStored, markToured, replayAll, replayPage, shouldRun, stopAll, TOUR_DEFAULTS } from "./state.ts";

describe("who sees a tour", () => {
  it("a new device sees every page once", () => {
    const p = fromStored(null);
    assert.equal(p.tour, true);
    assert.equal(shouldRun(p, "plots"), true);
    const after = markToured(p, "plots");
    assert.equal(shouldRun(after, "plots"), false);
    assert.equal(shouldRun(after, "crops"), true);
  });
  it("a device that held preferences before the tour existed starts with it off", () => {
    const p = fromStored({});
    assert.equal(p.tour, false);
    assert.equal(shouldRun(p, "plots"), false);
    assert.deepEqual(p.toured, {});
  });
  it("stored tour facts are kept, and odd ones dropped", () => {
    const p = fromStored({ tour: true, toured: { plots: true, crops: "yes" as never }, replay: 7 as never });
    assert.equal(p.tour, true);
    assert.deepEqual(p.toured, { plots: true });
    assert.equal(p.replay, null);
  });
  it("keeps whatever else the preferences hold", () => {
    const p = { ...TOUR_DEFAULTS, bees: true, units: "F" };
    assert.equal(markToured(p, "x").bees, true);
    assert.equal(stopAll(p).units, "F");
  });
});

describe("stopping and starting again", () => {
  it("stop ends it on every page", () => {
    const p = stopAll(fromStored(null));
    for (const page of ["plots", "crops", "account"]) assert.equal(shouldRun(p, page), false);
  });
  it("the switch on in the profile replays everything", () => {
    const p = replayAll(markToured(markToured(stopAll(fromStored(null)), "plots"), "crops"));
    assert.equal(p.tour, true);
    assert.deepEqual(p.toured, {});
    assert.equal(shouldRun(p, "plots"), true);
  });
  it("a guide replays its own page once, whatever the switch says", () => {
    const off = markToured(stopAll(fromStored(null)), "plots");
    const p = replayPage(off, "plots");
    assert.equal(p.tour, false);
    assert.equal(shouldRun(p, "plots"), true);
    assert.equal(shouldRun(p, "crops"), false);
    const done = markToured(p, "plots");
    assert.equal(done.replay, null);
    assert.equal(shouldRun(done, "plots"), false);
  });
  it("a replay asked for one page leaves another's mark alone", () => {
    const p = replayPage(markToured(markToured(fromStored(null), "plots"), "crops"), "plots");
    assert.deepEqual(p.toured, { crops: true });
  });
});
