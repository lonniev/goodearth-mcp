// Run: node --experimental-strip-types --test src/lib/plotShapes.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plotShapes } from "./plotShapes.ts";

/// A closed GeoJSON square of `deg` degrees a side.
function square(deg: number) {
  return { coordinates: [[[-73, 44], [-73 + deg, 44], [-73 + deg, 44 + deg], [-73, 44 + deg], [-73, 44]]] };
}

describe("plotShapes", () => {
  it("draws the largest first so a nested plot stays tappable on top", () => {
    const shapes = plotShapes([
      { id: "bed", name: "Bed", region: square(0.001) },
      { id: "farm", name: "Farm", region: square(0.01) },
      { id: "pin", name: "Hollow", region: { lat: 44.002, lon: -72.998, radius_m: 30 } },
    ]);
    assert.deepEqual(shapes.map((s) => s.id), ["farm", "bed", "pin"]);
  });
  it("carries a pin as a circle of its own radius", () => {
    const [s] = plotShapes([{ id: "p", name: "P", region: { lat: 44, lon: -73, radius_m: 50 } }]);
    assert.equal(s.kind, "pin");
    assert.ok(s.kind === "pin" && s.radiusM === 50 && s.centre.lng === -73);
  });
  it("skips a polygon too short to have an area", () => {
    assert.equal(plotShapes([{ id: "x", name: "X", region: { coordinates: [[[-73, 44], [-72, 44]]] } }]).length, 0);
  });
});
