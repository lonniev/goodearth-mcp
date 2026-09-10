// Radar tiles — the cap, and the URL shape that depends on it.
//
// Run: node --experimental-strip-types --test src/lib/radar.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coverageHours, coverageLabel, frameLabel, RADAR_MAX_NATIVE_ZOOM, tileUrl, type RadarIndex } from "./radar.ts";

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

describe("what the radar control says it covers", () => {
  const at = (...hours: number[]) =>
    ({ frames: hours.map((h) => ({ time: h * 3600, kind: "past" })) }) as never;

  it("names the span the feed returned, not one we chose", () => {
    assert.equal(coverageLabel(at(0, 1, 2)), "Latest 2 hrs of Radar");
    assert.equal(coverageLabel(at(0, 3.4)), "Latest 3 hrs of Radar");
  });

  it("does not say '1 hrs'", () => {
    assert.equal(coverageLabel(at(0, 1)), "Latest 1 hr of Radar");
  });

  it("says nothing false when there is nothing to loop", () => {
    assert.equal(coverageLabel(at(0)), "Latest 0 hrs of Radar");
  });
});
