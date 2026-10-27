// Run: node --experimental-strip-types --test src/lib/daysToHeat.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mayFill, packetDays } from "./daysToHeat.ts";

describe("a packet's days to maturity", () => {
  it("reads a whole number of days in the server's range", () => {
    assert.equal(packetDays("75"), 75);
    assert.equal(packetDays(" 120 "), 120);
  });

  it("is nothing for what no packet says", () => {
    for (const raw of ["", "13", "366", "-5", "75.5", "1e2", "seventy", "75 days"]) {
      assert.equal(packetDays(raw), null, raw);
    }
  });
});

describe("filling the heat target", () => {
  it("fills an empty field", () => assert.equal(mayFill("", ""), true));

  it("refreshes the figure it wrote itself", () => assert.equal(mayFill("1240", "1240"), true));

  it("never overwrites a figure the grower typed", () => {
    assert.equal(mayFill("900", ""), false);
    assert.equal(mayFill("900", "1240"), false);
  });
});
