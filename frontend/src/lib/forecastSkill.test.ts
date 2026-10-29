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
    assert.deepEqual(skillChip(skill, "temp_max", F), {
      pct: 83, title: "Next-day forecast within ±3°F on 25 of 30 days · 3 days out: 70%",
    });
  });

  it("states a tolerance in the reader's units, as a difference", () => {
    assert.match(skillChip(skill, "temp_max", C)!.title, /within ±1\.7°C/);
    assert.match(skillChip(skill, "pressure", F)!.title, /within ±0\.09 inHg/);
  });

  it("says rain is scored on whether it rained", () => {
    assert.equal(skillChip(skill, "precip", F)!.title, "Next-day forecast right about rain on 27 of 30 days");
  });

  it("is absent for a measure not scored, or no score at all", () => {
    assert.equal(skillChip(skill, "sunshine", F), null);
    assert.equal(skillChip(undefined, "temp_max", F), null);
  });
});
