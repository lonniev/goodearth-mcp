// Run: node --experimental-strip-types --test src/lib/stationNow.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readingLine, reportAge, tileReadings, windSpeed, type StationReading } from "./stationNow.ts";

const r = (sensor_kind: string, quantity: number, unit: string, channel: number | null = null, channel_name: string | null = null): StationReading =>
  ({ sensor_kind, quantity, unit, channel, channel_name, observed_at: "2026-10-30T14:00:00Z" });

describe("a station's reading on a plot's card", () => {
  it("speaks the reader's units", () => {
    assert.match(readingLine(r("air_temperature", 10, "°C"), "F").value, /50\.0.*F/);
    assert.match(readingLine(r("air_temperature", 10, "°C"), "C").value, /10\.0.*C/);
    assert.equal(readingLine(r("wind_speed", 4.47, "m/s"), "F").value, "10.0 mph");
    assert.equal(readingLine(r("rain_total", 25.4, "mm"), "F").value, "1.00 in");
    assert.equal(readingLine(r("rain_total", 25.4, "mm"), "C").value, "25.4 mm");
    assert.match(readingLine(r("pressure", 1016, "hPa"), "F").value, /inHg/);
  });

  it("uses the forecast cards' marks and names a probe", () => {
    assert.equal(readingLine(r("relative_humidity", 54, "%"), "F").emoji, "💦");
    assert.equal(readingLine(r("pressure", 1016, "hPa"), "F").emoji, "barometer");
    assert.equal(readingLine(r("rain_total", 1, "mm"), "F").emoji, "🌧️");
    assert.equal(readingLine(r("soil_moisture", 34, "%", 2), "F").label, "soil moisture 2");
    assert.equal(readingLine(r("soil_moisture", 34, "%", 2, "Row 4"), "F").label, "soil moisture Row 4");
  });

  it("gives the wind one tile", () => {
    const all = [r("air_temperature", 9, "°C"), r("wind_speed", 4.47, "m/s"), r("wind_direction", 45, "deg")];
    assert.deepEqual(tileReadings(all).map((x) => x.sensor_kind), ["air_temperature"]);
    assert.equal(windSpeed(all, "F"), "10.0 mph");
    assert.equal(windSpeed([], "F"), "—");
  });

  it("still shows a kind it does not know", () => {
    assert.deepEqual(readingLine(r("sap_flow", 4, "g/h"), "F"), { label: "sap flow", value: "4 g/h", emoji: "📟" });
  });
});

describe("how old a report is", () => {
  const now = Date.parse("2026-10-30T14:00:00Z");
  it("uses the fewest words", () => {
    assert.equal(reportAge("2026-10-30T13:59:30Z", now), "just now");
    assert.equal(reportAge("2026-10-30T13:30:00Z", now), "30 min ago");
    assert.equal(reportAge("2026-10-30T09:00:00Z", now), "5 h ago");
    assert.equal(reportAge("2026-10-20T14:00:00Z", now), "10 days ago");
    assert.equal(reportAge("not a date", now), "");
  });
});
