// Area is the number a grower checks against their own field book. If it is
// wrong, nothing else on the page gets believed.
//
// Run: node --experimental-strip-types --test src/lib/geo.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  areaM2, acres, distanceM, formatArea, geoJSONToRing, isDrawable, ringToGeoJSON,
} from "./geo.ts";

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
