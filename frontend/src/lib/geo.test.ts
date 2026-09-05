// Area is the number a grower checks against their own field book. If it is
// wrong, nothing else on the page gets believed.
//
// Run: node --experimental-strip-types --test src/lib/geo.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acres, areaM2, distanceM, formatArea, geoJSONToRing, isDrawable, lonScaleAt, ringToGeoJSON, withinRing } from "./geo.ts";

/// A square of `side` metres, anchored at `lat`.
function square(lat: number, lng: number, side: number) {
  const dLat = side / 111_320;
  const dLng = side / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    { lat, lng },
    { lat, lng: lng + dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat + dLat, lng },
  ];
}

describe("areaM2", () => {
  it("measures a 1 km square as about 1 km²", () => {
    const a = areaM2(square(0, 0, 1000));
    assert.ok(Math.abs(a - 1_000_000) / 1_000_000 < 0.01, `got ${a}`);
  });

  it("stays accurate at Vermont's latitude, where a flat shoelace drifts", () => {
    const a = areaM2(square(44.48, -73.21, 1000));
    assert.ok(Math.abs(a - 1_000_000) / 1_000_000 < 0.01, `got ${a}`);
  });

  it("converts to the acres a grower actually uses", () => {
    // 1 km² is 247.105 acres.
    assert.ok(Math.abs(acres(areaM2(square(44.48, -73.21, 1000))) - 247.105) < 2.5);
  });

  it("is independent of winding direction", () => {
    const r = square(44.48, -73.21, 500);
    assert.ok(Math.abs(areaM2(r) - areaM2([...r].reverse())) < 1);
  });

  it("gives a degenerate shape no area", () => {
    assert.equal(areaM2([]), 0);
    assert.equal(areaM2([{ lat: 44, lng: -73 }]), 0);
    assert.equal(areaM2([{ lat: 44, lng: -73 }, { lat: 44.1, lng: -73 }]), 0);
  });
});

describe("distanceM", () => {
  it("measures a degree of latitude as about 111 km", () => {
    const d = distanceM({ lat: 44, lng: -73 }, { lat: 45, lng: -73 });
    assert.ok(Math.abs(d - 111_195) < 500, `got ${d}`);
  });

  it("is zero for the same point", () => {
    assert.equal(Math.round(distanceM({ lat: 44, lng: -73 }, { lat: 44, lng: -73 })), 0);
  });
});

describe("formatArea", () => {
  it("shows both acres and hectares, because the paperwork and the grid differ", () => {
    const s = formatArea(40_468);
    assert.ok(s.includes("acres") && s.includes("ha"), s);
  });

  it("falls back to square metres for a bed rather than 0.01 acres", () => {
    assert.ok(formatArea(200).includes("m²"));
  });
});

describe("GeoJSON round trip", () => {
  it("closes the ring on the way out and opens it on the way back", () => {
    const ring = square(44.48, -73.21, 500);
    const g = ringToGeoJSON(ring);
    assert.equal(g.type, "Polygon");
    const coords = g.coordinates[0];
    assert.deepEqual(coords[0], coords[coords.length - 1], "ring must be closed");
    assert.equal(geoJSONToRing(g).length, ring.length, "and open again on return");
  });

  it("emits [lng, lat], the order GeoJSON specifies", () => {
    const g = ringToGeoJSON([{ lat: 44.48, lng: -73.21 }, { lat: 44.49, lng: -73.21 }, { lat: 44.49, lng: -73.2 }]);
    assert.equal(g.coordinates[0][0][0], -73.21, "longitude first");
    assert.equal(g.coordinates[0][0][1], 44.48, "latitude second");
  });

  it("survives a ring that already arrives closed", () => {
    const g = { type: "Polygon" as const, coordinates: [[[-73.21, 44.48], [-73.2, 44.48], [-73.2, 44.49], [-73.21, 44.48]]] };
    assert.equal(geoJSONToRing(g).length, 3);
  });
});

describe("isDrawable", () => {
  it("needs three corners and an actual area", () => {
    assert.equal(isDrawable([]), false);
    assert.equal(isDrawable(square(44, -73, 500).slice(0, 2)), false);
    assert.equal(isDrawable(square(44, -73, 500)), true);
  });

  it("rejects three collinear points, which enclose nothing", () => {
    assert.equal(isDrawable([
      { lat: 44.0, lng: -73.0 }, { lat: 44.1, lng: -73.0 }, { lat: 44.2, lng: -73.0 },
    ]), false);
  });
});

describe("a box is not a farm", () => {
  /// An L. Its bounding box covers the notch, which is somebody else's.
  const L = [
    { lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 4, lng: 10 },
    { lat: 4, lng: 4 }, { lat: 10, lng: 4 }, { lat: 10, lng: 0 },
  ];

  it("keeps a point in the block", () => {
    assert.equal(withinRing({ lat: 2, lng: 2 }, L), true);
    assert.equal(withinRing({ lat: 8, lng: 2 }, L), true);
  });

  it("rejects the notch, which the bounding box would have kept", () => {
    // Inside min/max on both axes, outside the ring. This is the whole point:
    // an L-shaped farm's box holds a great deal of the neighbour's ground.
    const p = { lat: 8, lng: 8 };
    assert.equal(p.lat >= 0 && p.lat <= 10 && p.lng >= 0 && p.lng <= 10, true);
    assert.equal(withinRing(p, L), false);
  });

  it("rejects a point well outside", () => {
    assert.equal(withinRing({ lat: 20, lng: 20 }, L), false);
    assert.equal(withinRing({ lat: -1, lng: 2 }, L), false);
  });

  it("counts a vertex once rather than twice", () => {
    // A ray leaving exactly at a vertex's latitude crosses two edges there. A
    // naive test flips twice and reports a point inside as outside.
    const tri = [{ lat: 0, lng: 0 }, { lat: 5, lng: 10 }, { lat: 10, lng: 0 }];
    assert.equal(withinRing({ lat: 5, lng: 2 }, tri), true);
  });

  it("is false for anything that is not a ring", () => {
    assert.equal(withinRing({ lat: 1, lng: 1 }, []), false);
    assert.equal(withinRing({ lat: 1, lng: 1 }, [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]), false);
  });
});

describe("a degree of longitude is not a fixed width", () => {
  it("is one to one at the equator", () => {
    assert.ok(Math.abs(lonScaleAt(0) - 1) < 0.001);
  });

  it("is two to one at sixty degrees", () => {
    assert.ok(Math.abs(lonScaleAt(60) - 2) < 0.001);
  });

  it("gives the hardcoded 1.4 back at the latitude it was written for", () => {
    // 1.4 was right for Panton VT and wrong everywhere else, which is exactly
    // why it could sit in the code unnoticed.
    assert.ok(Math.abs(lonScaleAt(44.45) - 1.4) < 0.01);
  });

  it("does not run away at the pole", () => {
    // Unclamped this is infinity, and a block there would ask for the world.
    assert.ok(Number.isFinite(lonScaleAt(90)));
    assert.ok(lonScaleAt(90) <= 20);
  });

  it("is symmetric across the equator", () => {
    assert.equal(lonScaleAt(-44.45), lonScaleAt(44.45));
  });
});
