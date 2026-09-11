import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanAliases, sameName, withAlias } from "./aliases.ts";

describe("aliases", () => {
  it("treats case and spacing as the same name", () => {
    assert.ok(sameName("  North  Field ", "north field"));
  });

  it("drops blanks, repeats and the plot's own name", () => {
    assert.deepEqual(
      cleanAliases(["", " Home ", "home", "North Field", "the bench"], "North Field"),
      ["Home", "the bench"],
    );
  });

  it("keeps the first spelling of a repeat", () => {
    assert.deepEqual(cleanAliases(["The Bench", "the bench"], "x"), ["The Bench"]);
  });

  it("adds a new name and ignores one it already has", () => {
    assert.deepEqual(withAlias(["Home"], "the farm", "North"), ["Home", "the farm"]);
    assert.deepEqual(withAlias(["Home"], "HOME", "North"), ["Home"]);
    assert.deepEqual(withAlias(["Home"], "   ", "North"), ["Home"]);
  });
});
