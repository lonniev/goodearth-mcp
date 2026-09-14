// A brood started in December keeps its day through the new year.
// Run: node --experimental-strip-types --test src/lib/newYear.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cycleRows } from "./husbandry.ts";
import { buildFlags } from "./ledgerFlags.ts";
import type { SavedWildlife } from "./mcp";

const brood = {
  species: "Domestic chicken", startLabel: "laying on eggs", startOn: "2026-12-20",
  steps: [{ label: "eggs hatch", days: 21 }],
} as never;

const season = (year: number) => ({
  season_start: `${year}-01-01`, base_temp_f: 50,
  curve: {
    dates: Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(year, 0, 1 + i)).toISOString().slice(0, 10)),
    cumulative_mean: Array.from({ length: 365 }, (_, i) => i * 5),
  },
}) as never;

describe("a brood across the new year", () => {
  it("saves the start with its full date, not month-and-day alone", () => {
    const rows = cycleRows(brood, "b1") as SavedWildlife[];
    assert.equal(rows[0].on, "2026-12-20");
    assert.equal(rows[0].typical_on, "12-20");
  });

  it("is placed on its own day in the season it happened", () => {
    const [start] = cycleRows(brood, "b1") as SavedWildlife[];
    const flags = buildFlags(season(2026), [], [], [start]);
    assert.equal(flags[0]?.date, "2026-12-20");
  });

  it("is not re-dated to next December in the new season", () => {
    const [start] = cycleRows(brood, "b1") as SavedWildlife[];
    const flags = buildFlags(season(2027), [], [], [start]);
    assert.ok(!flags.some((f) => f.date === "2027-12-20"), "the brood came back as next December's");
  });

  it("still re-dates a genuinely annual event", () => {
    const heron = { species: "Great blue heron", event: "arrives", driver: "calendar", typical_on: "04-02" } as SavedWildlife;
    assert.equal(buildFlags(season(2027), [], [], [heron])[0]?.date, "2027-04-02");
  });
});
