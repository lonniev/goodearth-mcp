// Run: node --experimental-strip-types --test src/lib/forecastSkill.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { skillChip } from "./forecastSkill.ts";
import type { ForecastSkill } from "./mcp.ts";

const F = { tempDelta: (f: number) => `${f}°F`, pressureDelta: (h: number) => `${(h / 33.8639).toFixed(2)} inHg` };
const C = { tempDelta: (f: number) => `${((f * 5) / 9).toFixed(1)}°C`, pressureDelta: (h: number) => `${h} hPa` };

const skill: ForecastSkill = {
  from: "2026-09-29", to: "2026-10-28",
  measures: {
    temp_max: { within: 3, leads: { "1": { hits: 25, days: 30, pct: 83 }, "3": { hits: 21, days: 30, pct: 70 } } },
    precip: { within: null, leads: { "1": { hits: 27, days: 30, pct: 90 } } },
    pressure: { within: 3, leads: { "1": { hits: 29, days: 30, pct: 97 } } },
  },
};

describe("the forecast score on a card", () => {
  it("is the next-day figure, with both leads in its title", () => {
    const chip = skillChip(skill, "temp_max", F)!;
    assert.equal(chip.pct, 83);
    assert.equal(chip.title, "Next-day forecast within ±3°F on 25 of 30 days · 3 days out: 70%");
  });

  it("states a tolerance in the reader's units, as a difference", () => {
    assert.match(skillChip(skill, "temp_max", C)!.title, /within ±1\.7°C/);
    assert.match(skillChip(skill, "pressure", F)!.title, /within ±0\.09 inHg/);
  });

  it("says rain is scored on whether it rained", () => {
    assert.equal(skillChip(skill, "precip", F)!.title, "Next-day forecast right about rain on 27 of 30 days");
  });

  it("explains itself for each measure, in the reader's units", () => {
    const high = skillChip(skill, "temp_max", F)!.says;
    assert.equal(high[0], "Over the last month here, the forecast made the day before got the day's high within ±3°F on 25 of 30 days.");
    assert.equal(high[1], "Three days ahead, it was right 70% of the time.");
    assert.match(skillChip(skill, "temp_max", C)!.says[0], /within ±1\.7°C/);
    assert.match(skillChip(skill, "pressure", F)!.says[0], /the day's average pressure within ±0\.09 inHg/);
  });

  it("explains rain as the call, and has no three-day line without a three-day score", () => {
    const rain = skillChip(skill, "precip", F)!.says;
    assert.equal(rain[0], "Over the last month here, the forecast made the day before called rain or no rain correctly on 27 of 30 days.");
    assert.ok(rain.includes("A trace too small to wet anything counts as dry."));
    assert.ok(!rain.some((line) => line.startsWith("Three days")));
  });

  it("says the truth is the model's, on every card", () => {
    for (const key of ["temp_max", "precip", "pressure"] as const) {
      assert.match(skillChip(skill, key, F)!.says.at(-1)!, /not a station/);
    }
  });

  it("is absent for a measure not scored, or no score at all", () => {
    assert.equal(skillChip(skill, "sunshine", F), null);
    assert.equal(skillChip(undefined, "temp_max", F), null);
  });
});
