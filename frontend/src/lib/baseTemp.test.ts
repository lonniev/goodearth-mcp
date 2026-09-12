import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseBounds, parseBase, type Scale } from "./baseTemp.ts";

const F: Scale = { temp: (f) => f, toF: (x) => x, tempUnit: " °F" };
const C: Scale = { temp: (f) => (f - 32) * 5 / 9, toF: (c) => c * 9 / 5 + 32, tempUnit: " °C" };

describe("a base temperature", () => {
  it("is optional — blank takes the plot's", () => {
    assert.deepEqual(parseBase("", F), {});
    assert.deepEqual(parseBase("   ", F), {});
  });

  it("takes a temperature the service accepts", () => {
    assert.deepEqual(parseBase("50", F), { f: 50 });
    assert.deepEqual(parseBase("41", F), { f: 41 });
  });

  it("refuses words, and says what it wants", () => {
    const r = parseBase("fifty", F);
    assert.equal(r.f, undefined);
    assert.match(r.error ?? "", /20–80 °F/);
  });

  it("refuses a number that is not a base temperature", () => {
    assert.match(parseBase("780", F).error ?? "", /between 20–80 °F/);
    assert.match(parseBase("5", F).error ?? "", /between/);
  });

  it("works in the reader's own scale", () => {
    assert.deepEqual(baseBounds(C), { min: -6, max: 26 });
    assert.equal(parseBase("10", C).f, 50);
    assert.match(parseBase("30", C).error ?? "", /-6–26 °C/);
  });
});
