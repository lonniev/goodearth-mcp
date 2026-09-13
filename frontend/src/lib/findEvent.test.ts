import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findEvent } from "./findEvent.ts";

const F = [
  { label: "Muskrats come out of hibernation", index: 90 },
  { label: "Grey squirrel · nut caching", index: 258 },
  { label: "Rats move into the barn", index: 300 },
  { label: "Fall-sow breadseed poppies", index: 246 },
  { label: "Cover the east beds", index: 260 },
];

describe("finding an event by name", () => {
  it("finds the owner's example from a few letters", () => {
    assert.equal(findEvent(F, "muskra", 255)?.label, "Muskrats come out of hibernation");
  });

  it("ignores case and spacing", () => {
    assert.equal(findEvent(F, "  GREY  Squ", 255)?.label, "Grey squirrel · nut caching");
  });

  it("prefers a word that STARTS with what was typed", () => {
    // "rat" is inside Muskrats and starts Rats; the grower meant Rats.
    assert.equal(findEvent(F, "rat", 90)?.label, "Rats move into the barn");
  });

  it("among equal matches, takes the one nearest today", () => {
    const two = [{ label: "Mow the meadow", index: 100 }, { label: "Mow the meadow", index: 250 }];
    assert.equal(findEvent(two, "mow", 255)?.index, 250);
  });

  it("waits for two letters, and says nothing when nothing matches", () => {
    assert.equal(findEvent(F, "m", 255), null);
    assert.equal(findEvent(F, "zebra", 255), null);
  });
});
