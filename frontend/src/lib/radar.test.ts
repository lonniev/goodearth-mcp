// Radar tiles — the cap, and the URL shape that depends on it.
//
// Run: node --experimental-strip-types --test src/lib/radar.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coverageHours, frameLabel, RADAR_MAX_NATIVE_ZOOM, tileUrl, type RadarIndex } from "./radar.ts";

const IDX: RadarIndex = {
  host: "https://tilecache.rainviewer.com",
  generated: 1_756_000_000,
  frames: [
    { time: 1_755_993_600, path: "/v2/radar/aaa", kind: "past" },
    { time: 1_756_000_800, path: "/v2/radar/bbb", kind: "nowcast" },
  ],
};

describe("radar", () => {
  it("caps the native zoom at what RainViewer actually renders", () => {
    // Above 7 the service answers 200 with a 1,370-byte "Zoom level not
    // supported" graphic — identical bytes at every zoom and location, so
    // status and content-type both look healthy while the overlay silently
    // becomes that picture. Measured at 256 and 512: z7 real, z8 placeholder.
    // Raising this without re-measuring puts the placeholder back on the map.
    assert.equal(RADAR_MAX_NATIVE_ZOOM, 7);
  });

  it("builds a tile template Leaflet can fill", () => {
    const u = tileUrl(IDX, IDX.frames[0]);
    assert.ok(u.startsWith("https://tilecache.rainviewer.com/v2/radar/aaa/256/"));
    assert.ok(u.includes("{z}") && u.includes("{x}") && u.includes("{y}"));
    assert.ok(u.endsWith(".png"));
  });

  it("marks a nowcast frame as a forecast and a past frame as a time", () => {
    assert.ok(frameLabel(IDX.frames[1]).endsWith("forecast"));
    assert.ok(!frameLabel(IDX.frames[0]).includes("forecast"));
  });

  it("reports the coverage it actually has", () => {
    assert.equal(coverageHours(IDX), 2);
    assert.equal(coverageHours({ ...IDX, frames: [IDX.frames[0]] }), 0);
  });
});
