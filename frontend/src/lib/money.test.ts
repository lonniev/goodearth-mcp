import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roughly, usd } from "./money.ts";

describe("dollars as a card prints them", () => {
  it("whole dollars by default, cents on request", () => {
    assert.equal(usd(74976), "$74,976");
    assert.equal(usd(18.9, 2), "$18.90");
    assert.equal(usd(0.4, 2), "$0.40");
    assert.equal(usd(1234567), "$1,234,567");
  });
  it("rounds a screening estimate to three figures", () => {
    assert.equal(roughly(74976), 75000);
    assert.equal(roughly(1234567), 1230000);
    assert.equal(roughly(18.94, 2), 19);
    assert.equal(roughly(0), 0);
    assert.equal(roughly(999.6), 1000);
  });
});
