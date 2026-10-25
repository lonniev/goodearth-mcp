import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chanceOf, dayDetails, dayForecast, rainfall, stormLine, windLine, zoneForecast } from "./zoneForecast.ts";

const day = (over: Record<string, unknown> = {}) => ({
  date: "2026-10-27", sky: { label: "Partly cloudy", emoji: "⛅" },
  wind: { from: "W", arrow: "→", emoji: "🍃", strength: "light", speed_mph: 12.4 },
  high_f: 61.6, low_f: 40.2, dew_point_f: 38, humidity_pct: 70, pressure_hpa: 1015,
  precip_in: 0, precip_chance_pct: 5, sunshine_hours: 6,
  ...over,
});

describe("zoneForecast", () => {
  it("writes a dry day and its night the Weather Service way", () => {
    const text = dayForecast(day(), day({ date: "2026-10-28", low_f: 38.6 }), "F", "2026-10-25");
    assert.equal(text,
      ".TUESDAY...Partly sunny, with a high near 62. West wind up to 12 mph. " +
      "Dew point near 38. Humidity around 70 percent. Barometer 29.97 inHg. About 6 hours of sunshine.\n" +
      ".TUESDAY NIGHT...Low around 39.");
  });
  it("calls today TODAY and TONIGHT", () => {
    const text = dayForecast(day({ date: "2026-10-25" }), day(), "F", "2026-10-25");
    assert.match(text, /^\.TODAY\.\.\./);
    assert.match(text, /\n\.TONIGHT\.\.\./);
  });
  it("leaves the night out when the next morning is not known", () => {
    assert.doesNotMatch(dayForecast(day(), undefined, "F", "2026-10-25"), /NIGHT/);
  });
  it("uses the Weather Service's chance words", () => {
    assert.equal(chanceOf(10, "rain"), null);
    assert.deepEqual(chanceOf(20, "rain"), ["A slight chance of rain.", null]);
    assert.deepEqual(chanceOf(34, "showers"), ["A 30 percent chance of showers.", null]);
    assert.deepEqual(chanceOf(64, "rain"), ["Rain likely.", "Chance of precipitation is 60%."]);
    assert.deepEqual(chanceOf(90, "snow"), ["Snow.", "Chance of precipitation is 90%."]);
  });
  it("brackets the rain and says nothing under a tenth", () => {
    assert.equal(rainfall(0.05, false), null);
    assert.equal(rainfall(0.3, false), "New rainfall amounts between a quarter and half of an inch possible.");
  });
  it("says calm, and spells the wind's point out", () => {
    assert.equal(windLine({ from: "NNW", arrow: null, emoji: "", strength: null, speed_mph: 2 }), "Calm wind.");
    assert.equal(windLine({ from: "NNW", arrow: null, emoji: "", strength: null, speed_mph: 18 }),
      "North northwest wind up to 18 mph.");
  });
  it("puts a wet day's rain first and its odds last", () => {
    const text = dayForecast(day({ sky: { label: "Rain", emoji: "🌧️" }, precip_chance_pct: 70, precip_in: 0.6 }),
      undefined, "F", "2026-10-25");
    assert.ok(text.startsWith(".TUESDAY...Rain likely. Mostly cloudy, with a high near 62. West wind up to 12 mph. " +
      "Chance of precipitation is 70%. New rainfall amounts between a half and three quarters of an inch possible. Dew point"));
  });
  it("tells the barometer's move from the day before, in the reader's unit", () => {
    assert.deepEqual(dayDetails(day({ pressure_hpa: 1008, dew_point_f: null, humidity_pct: null, sunshine_hours: 0 }),
      day({ pressure_hpa: 1013 }), "C"), ["Barometer 1008 hPa and falling.", "No sunshine."]);
  });
  it("warns of a storm only on the day its worst fall lands", () => {
    const storm = { level: "storm likely", worst: { at: "2026-10-27T15:00", fall_3h_hpa: -4, change_24h_hpa: -9 } } as never;
    assert.equal(stormLine(storm, "2026-10-27"), "Storm likely: the barometer is forecast to fall fast.");
    assert.equal(stormLine(storm, "2026-10-28"), null);
  });
  it("gives a °C reader the unit", () => {
    assert.match(dayForecast(day(), undefined, "C", "2026-10-25"), /high near 16°C/);
  });
  it("heads the product with the plot and when it was read", () => {
    const text = zoneForecast({ days: [day()], index: 0, unit: "F", place: "Frogdale",
      issued: new Date("2026-10-25T11:05:00Z"), today: "2026-10-25" });
    const [first, second, blank] = text.split("\n");
    assert.equal(first, "Point forecast for Frogdale");
    assert.match(second, /^Good Earth · issued /);
    assert.equal(blank, "");
  });
});
