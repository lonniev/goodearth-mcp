import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DWELL_MAX_MS, DWELL_MIN_MS, dwellMs } from "./dwell.ts";

describe("how long a popup stays", () => {
  it("never less than the floor, even for a word or two", () => {
    assert.equal(dwellMs("Past target"), DWELL_MIN_MS);
    assert.equal(dwellMs(""), DWELL_MIN_MS);
  });

  it("grows with what there is to read", () => {
    const forty = Array.from({ length: 40 }, () => "word").join(" ");
    assert.equal(dwellMs(forty), 13000);
  });

  it("never so long it may as well be stuck", () => {
    const essay = Array.from({ length: 400 }, () => "word").join(" ");
    assert.equal(dwellMs(essay), DWELL_MAX_MS);
  });
});
