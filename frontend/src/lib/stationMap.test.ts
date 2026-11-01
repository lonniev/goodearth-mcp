import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distanceKm, stationMarkers } from "./stationMap.ts";

const place = { latitude: 44, longitude: -73 };
const at = (station_id: string, latitude: number | null, longitude: number | null) =>
  ({ station_id, name: station_id, latitude, longitude });

describe("the station map's markers", () => {
  it("measures between two places", () => {
    assert.ok(Math.abs(distanceKm(44, -73, 45, -73) - 111.2) < 0.5);
  });

  it("marks a tracked station once, with no choice to make", () => {
    const [m, ...rest] = stationMarkers(place, [at("a", 44.1, -73)],
      [{ ...at("a", 44.1, -73), distance_km: 11, choice: "ambient:1:2:a" }], 50);
    assert.equal(rest.length, 0);
    assert.equal(m.choice, "");
  });

  it("leaves a far tracked station and one with no place to the list", () => {
    assert.deepEqual(stationMarkers(place, [at("far", 50, -73), at("nowhere", null, null)], [], 50), []);
  });

  it("offers a published station by its choice, nearest first", () => {
    const got = stationMarkers(place, [], [
      { ...at("b", 44.3, -73), distance_km: 33, choice: "ambient:1:2:b" },
      { ...at("c", 44.1, -73), distance_km: 11, choice: "ambient:1:2:c" },
    ], 50);
    assert.deepEqual(got.map((m) => m.station_id), ["c", "b"]);
    assert.equal(got[0].choice, "ambient:1:2:c");
  });
});
