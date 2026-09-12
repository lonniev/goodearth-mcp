import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTap } from "./tapIntent.ts";

describe("a tap on a row", () => {
  it("is a press that lifts where it went down", () => {
    assert.equal(isTap({ id: "maple", x: 100, y: 200 }, { id: "maple", x: 103, y: 204 }), true);
  });

  it("is not a finger that scrolled the list", () => {
    assert.equal(isTap({ id: "maple", x: 100, y: 200 }, { id: "maple", x: 100, y: 240 }), false);
  });

  it("is not a press that lifted over a different row", () => {
    assert.equal(isTap({ id: "puya", x: 100, y: 200 }, { id: "maple", x: 100, y: 205 }), false);
  });

  it("is not a lift with no press behind it", () => {
    assert.equal(isTap(null, { id: "maple", x: 0, y: 0 }), false);
  });
});
