import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allGroups, ancestors, childrenOf, cleanPath, filedIn, hideGroup, isOpen, isWithin, leaf, memberIds,
  moveOpen, renameGroup, reveal, showGroup, toggleOpen, ungrouped, withGroup,
} from "./plotGroups.ts";
import type { SavedRegion } from "./regions.ts";

const plot = (id: string, groups: string[]): SavedRegion => ({
  id, name: id, baseTempF: 50, groups,
  region: { lat: 44, lon: -73, radius_m: 50 },
});

const farm = [
  plot("apples", ["North Farm / Orchard / Apples"]),
  plot("pears", ["North Farm / Orchard"]),
  plot("garden", ["North Farm / Gardens", "Market"]),
  plot("meadow", []),
];

describe("group paths", () => {
  it("cleans a typed path", () => {
    assert.equal(cleanPath("a/ b /c"), "a / b / c");
    assert.equal(cleanPath(" / "), "");
    assert.equal(cleanPath("a/b/c/d/e/f/g"), "");
  });
  it("knows what lies inside a group", () => {
    assert.ok(isWithin("North Farm / Orchard", "north farm"));
    assert.ok(isWithin("North Farm", "North Farm"));
    assert.ok(!isWithin("North Farmstead", "North Farm"));
    assert.ok(!isWithin("North Farm", "North Farm / Orchard"));
  });
  it("lists the groups around a path, and the last step", () => {
    assert.deepEqual(ancestors("A / B / C"), ["A", "A / B", "A / B / C"]);
    assert.equal(leaf("A / B / C"), "C");
  });
});

describe("groups of groups", () => {
  it("lists every group, with the ones around them", () => {
    assert.deepEqual(allGroups(farm), [
      "Market", "North Farm", "North Farm / Gardens", "North Farm / Orchard", "North Farm / Orchard / Apples",
    ]);
  });
  it("steps down one level at a time", () => {
    assert.deepEqual(childrenOf(farm, ""), ["Market", "North Farm"]);
    assert.deepEqual(childrenOf(farm, "North Farm"), ["North Farm / Gardens", "North Farm / Orchard"]);
    assert.deepEqual(childrenOf(farm, "North Farm / Orchard"), ["North Farm / Orchard / Apples"]);
  });
  it("counts the plots in groups inside a group", () => {
    assert.deepEqual(memberIds(farm, "North Farm"), ["apples", "pears", "garden"]);
    assert.deepEqual(memberIds(farm, "North Farm / Orchard"), ["apples", "pears"]);
  });
});

describe("folders", () => {
  it("files a plot in each group it names, and nowhere above", () => {
    assert.deepEqual(filedIn(farm, "North Farm / Orchard").map((p) => p.id), ["pears"]);
    assert.deepEqual(filedIn(farm, "north farm"), []);
    assert.deepEqual(filedIn(farm, "Market").map((p) => p.id), ["garden"]);
    assert.deepEqual(filedIn(farm, "North Farm / Gardens").map((p) => p.id), ["garden"]);
    assert.deepEqual(ungrouped(farm).map((p) => p.id), ["meadow"]);
  });
  it("opens and closes a folder", () => {
    const open = toggleOpen([], "North Farm");
    assert.ok(isOpen(open, "north farm"));
    assert.deepEqual(toggleOpen(open, "North Farm"), []);
  });
  it("reveals a group by opening every folder around it", () => {
    assert.deepEqual(reveal(["North Farm"], "North Farm / Orchard / Apples"),
      ["North Farm", "North Farm / Orchard", "North Farm / Orchard / Apples"]);
  });
  it("keeps folders open when their group moves", () => {
    assert.deepEqual(moveOpen(["North Farm / Orchard", "Market"], "North Farm", "South Farm"),
      ["South Farm / Orchard", "Market"]);
  });
});

describe("hiding and showing a group", () => {
  it("hides every plot below it and shows them again", () => {
    const hidden = hideGroup(["meadow"], farm, "North Farm / Orchard");
    assert.deepEqual(hidden, ["meadow", "apples", "pears"]);
    assert.deepEqual(showGroup(hidden, farm, "North Farm"), ["meadow"]);
  });
});

describe("membership", () => {
  it("puts a plot in a group and takes it out with everything inside", () => {
    assert.deepEqual(withGroup([], "Orchard", true), ["Orchard"]);
    assert.deepEqual(withGroup(["Orchard / Apples"], "Orchard", true), ["Orchard / Apples"]);
    assert.deepEqual(withGroup(["Orchard / Apples", "Market"], "Orchard", false), ["Market"]);
  });
  it("moves a group and everything under it", () => {
    const moved = renameGroup(farm, "North Farm / Orchard", "South Farm / Orchard");
    assert.deepEqual(moved.map((p) => [p.id, p.groups]), [
      ["apples", ["South Farm / Orchard / Apples"]],
      ["pears", ["South Farm / Orchard"]],
    ]);
    assert.deepEqual(renameGroup(farm, "Market", "market"), []);
  });
  it("refuses a move that would nest too deep", () => {
    assert.throws(() => renameGroup(farm, "North Farm", "a / b / c / d / e"));
  });
});
