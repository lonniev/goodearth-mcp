// Run: node --experimental-strip-types --test src/lib/husbandry.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cycleOf, cycleRows, dueList, filterSpecies, labelsUsed, lastInterval,
  mergeSpecies, monthDay, nextCycle, repeatable,
} from "./husbandry.ts";
import type { SavedWildlife } from "./wildlifeModels.ts";
import type { WildlifeCatalogResult, WildlifeRow } from "./mcp.ts";

const CATALOG = {
  success: true,
  groups: [{
    group: "Birds", taxon: "Aves", emoji: "🐦",
    species: [
      { name: "American robin", scientific_name: "Turdus migratorius", observations: 412, emoji: "🐦", has_habits: true },
      { name: "Domestic chicken", scientific_name: "Gallus gallus", observations: 7, emoji: "🐔" },
    ],
  }],
} as WildlifeCatalogResult;

const saved = (o: Partial<SavedWildlife>): SavedWildlife => ({
  id: o.id ?? "wl-x", regionId: "b1", species: "Domestic chicken",
  event: "", driver: "calendar", ...o,
} as SavedWildlife);

describe("the one list the animal is chosen from", () => {
  it("carries the flock in the barn, which nobody submits sightings of", () => {
    // The whole point of merging. A laying flock and a bred ewe are not in
    // anyone's nearby-species feed, and they are exactly what husbandry is.
    const list = mergeSpecies(CATALOG, [saved({ species: "Ewe" })]);
    assert.ok(list.find((p) => p.name === "Ewe"), "the record's own animal was dropped");
    assert.equal(list.find((p) => p.name === "Ewe")?.observations, undefined);
  });

  it("keeps the catalogue's figures for an animal that is in both", () => {
    const list = mergeSpecies(CATALOG, [saved({ species: "domestic  CHICKEN" })]);
    const hen = list.filter((p) => p.name.toLowerCase() === "domestic chicken");
    assert.equal(hen.length, 1, "one animal listed twice on a spelling");
    assert.equal(hen[0].observations, 7, "the count was thrown away");
    assert.equal(hen[0].yours, true);
  });

  it("folds spacing and accents, the way the server's `norm` does", () => {
    // Names arrive from a catalogue, from a chiclet and from typing. Each
    // spelling that fails to fold is a second animal holding half the history.
    for (const spelling of ["Domestic  chicken", " DOMESTIC CHICKEN "]) {
      const list = mergeSpecies(CATALOG, [saved({ species: spelling })]);
      assert.equal(list.filter((p) => p.observations === 7).length, 1);
      assert.equal(list.find((p) => p.observations === 7)?.yours, true, spelling);
    }
    assert.equal(cycleOf([saved({ species: "Ewé" })], "ewe").length, 1);
  });

  it("leads with what the grower already tracks", () => {
    // A second brood is recorded for an animal they have named before, and a
    // robin with 412 sightings should not sit above their own hen.
    const list = mergeSpecies(CATALOG, [saved({ species: "Domestic chicken" })]);
    assert.equal(list[0].name, "Domestic chicken");
  });

  it("has something to show before the catalogue answers", () => {
    assert.deepEqual(mergeSpecies(null, []), []);
    assert.equal(mergeSpecies(null, [saved({ species: "Ewe" })]).length, 1);
  });

  it("narrows on a substring, because a half-typed regex is not a search", () => {
    const list = mergeSpecies(CATALOG, []);
    assert.equal(filterSpecies(list, "chick").length, 1);
    assert.equal(filterSpecies(list, "Turdus").length, 1, "the binomial is searchable");
    assert.equal(filterSpecies(list, "(").length, 0, "a regex character threw");
    assert.equal(filterSpecies(list, "  ").length, 2);
  });
});

describe("what the grower has called things before", () => {
  it("offers their own words, most-used first", () => {
    const labels = labelsUsed([
      saved({ event: "eggs hatch" }), saved({ event: "laying on eggs" }),
      saved({ event: "eggs hatch" }), saved({ event: "" }),
    ]);
    assert.deepEqual(labels, ["eggs hatch", "laying on eggs"]);
  });

  it("defaults the count to what THIS grower used last, not to a table", () => {
    const rows = [
      saved({ species: "Domestic chicken", driver: "interval", days: 21, event: "hatch" }),
      saved({ species: "Muscovy duck", driver: "interval", days: 35, event: "hatch" }),
    ];
    assert.equal(lastInterval(rows, "domestic chicken"), 21);
    assert.equal(lastInterval(rows, "Muscovy duck"), 35);
    // The animal nobody has counted yet gets nothing. Inventing 21 here would
    // be the shipped natural-history table, one function further down.
    assert.equal(lastInterval(rows, "Ewe"), undefined);
  });

  it("ignores a row that names the animal but counts nothing", () => {
    assert.equal(lastInterval([saved({ species: "Ewe", driver: "calendar" })], "Ewe"), undefined);
  });
});

describe("a cycle is a start and what follows from it", () => {
  const CHICKEN = {
    species: "Domestic chicken", scientificName: "Gallus gallus",
    startLabel: "laying on eggs", startOn: "2026-09-05",
    steps: [{ label: "eggs hatch", days: 21 }],
  };

  it("writes the pair the feed is proven to publish", () => {
    const rows = cycleRows(CHICKEN, "b1");
    assert.notEqual(typeof rows, "string", `refused: ${rows}`);
    const [start, hatch] = rows as SavedWildlife[];

    assert.equal(start.driver, "calendar");
    assert.equal(start.typical_on, "09-05");
    assert.equal(hatch.driver, "interval");
    assert.equal(hatch.days, 21);
    assert.equal(hatch.from, "2026-09-05");
    // Both rows are the same animal, and both carry the reference — USA-NPN is
    // keyed on the binomial, so a row without it has no year to look up.
    assert.equal(hatch.species, "Domestic chicken");
    assert.equal(hatch.scientific_name, "Gallus gallus");
  });

  it("carries the grower's judgment about the animal onto every row", () => {
    const rows = cycleRows({ ...CHICKEN, role: "friend" }, "b1") as SavedWildlife[];
    for (const r of rows) {
      assert.equal((r as unknown as { role?: string }).role, "friend");
    }
  });

  it("gives every row its own id", () => {
    const rows = cycleRows({ ...CHICKEN, steps: [
      { label: "eggs hatch", days: 21 }, { label: "off the nest", days: 23 },
    ] }, "b1") as SavedWildlife[];
    assert.equal(new Set(rows.map((r) => r.id)).size, 3, "two rows took one id");
  });

  it("saves none of it when one milestone will not validate", () => {
    // All-or-nothing downstream — `saveMany` is one write. Half a cycle is not
    // a thing anyone meant to record.
    const bad = cycleRows({ ...CHICKEN, steps: [
      { label: "eggs hatch", days: 21 }, { label: "off the nest", days: 0 },
    ] }, "b1");
    assert.equal(typeof bad, "string");
  });

  it("asks for the day rather than assuming one", () => {
    assert.match(String(cycleRows({ ...CHICKEN, startOn: "" }, "b1")), /day/);
    assert.match(String(cycleRows({ ...CHICKEN, species: " " }, "b1")), /animal/i);
    assert.match(String(cycleRows({ ...CHICKEN, startLabel: "" }, "b1")), /happened/);
  });

  it("takes a start with no milestones — a date is worth recording alone", () => {
    const rows = cycleRows({ ...CHICKEN, steps: [] }, "b1");
    assert.equal((rows as SavedWildlife[]).length, 1);
  });

  it("reads MM-DD off the day, and nothing off a non-date", () => {
    assert.equal(monthDay("2026-09-05"), "09-05");
    assert.equal(monthDay("sometime in April"), "");
    assert.equal(monthDay(""), "");
  });
});

describe("the next brood", () => {
  const CYCLE = [
    saved({ id: "wl-1", event: "laying on eggs", driver: "calendar",
            typical_on: "09-05", scientific_name: "Gallus gallus" }),
    saved({ id: "wl-2", event: "eggs hatch", driver: "interval",
            days: 21, from: "2026-09-05" }),
  ];

  it("keeps the labels and the counts, and takes a new day", () => {
    const draft = nextCycle(CYCLE, "2026-10-02");
    assert.notEqual(typeof draft, "string", `refused: ${draft}`);
    const d = draft as ReturnType<typeof Object> as never as {
      startOn: string; startLabel: string; steps: { days: number }[];
      scientificName?: string;
    };
    assert.equal(d.startOn, "2026-10-02");
    assert.equal(d.startLabel, "laying on eggs");
    assert.deepEqual(d.steps.map((s) => s.days), [21], "the count was re-asked for");
    assert.equal(d.scientificName, "Gallus gallus", "the reference was dropped");
  });

  it("mints new rows rather than moving the old ones", () => {
    const draft = nextCycle(CYCLE, "2026-10-02");
    const rows = cycleRows(draft as never, "b1") as SavedWildlife[];
    const old = new Set(CYCLE.map((r) => r.id));
    for (const r of rows) assert.ok(!old.has(r.id), "the previous cycle was overwritten");
    assert.equal(rows[1].from, "2026-10-02");
  });

  it("still works when only the interval was ever recorded", () => {
    const draft = nextCycle([CYCLE[1]], "2026-10-02");
    assert.notEqual(typeof draft, "string");
  });

  it("says so when there is no cycle to repeat", () => {
    assert.equal(typeof nextCycle([], "2026-10-02"), "string");
    assert.equal(typeof nextCycle(CYCLE, "whenever"), "string");
  });

  it("gathers a cycle by the animal, which is all its rows share", () => {
    const all = [...CYCLE, saved({ id: "wl-9", species: "Ewe", event: "lambing" })];
    assert.equal(cycleOf(all, "Domestic chicken").length, 2);
    assert.equal(cycleOf(all, "  domestic chicken ").length, 2);
  });
});

describe("what to be looking for", () => {
  const row = (o: Partial<WildlifeRow>): WildlifeRow => ({
    species: "Domestic chicken", event: "eggs hatch", emoji: null, note: null,
    driver: "interval", threshold: "21 days", reached_on: null,
    projected_date: null, ...o,
  } as WildlifeRow);

  const TODAY = "2026-09-20";

  it("keeps the morning after, which the projection drops", () => {
    // THE GAP. A row whose day has passed carries `reached_on` and no
    // `projected_date`, so `due_soon` cannot hold it — correct arithmetic, and
    // useless to a grower on the day after a hatch was due. "Did it?" is the
    // question then, and it is the one worth answering.
    const list = dueList([
      row({ ref: "wl-1", reached_on: "2026-09-18" }),
      row({ ref: "wl-2", projected_date: "2026-09-26" }),
    ], new Set(), TODAY);

    assert.deepEqual(list.map((d) => d.daysAway), [-2, 6]);
    assert.equal(list[0].row.ref, "wl-1", "a day already past must lead");
  });

  it("stops asking once the grower has said what happened", () => {
    const list = dueList([row({ ref: "wl-1", reached_on: "2026-09-18" })],
                         new Set(["wl-1"]), TODAY);
    assert.equal(list[0].settled, true);
    assert.equal(dueList([row({ ref: "wl-1", reached_on: "2026-09-18" })],
                         new Set(["wl-9"]), TODAY)[0].settled, false);
  });

  it("does not carry last spring around all year", () => {
    assert.equal(dueList([row({ reached_on: "2026-04-01" })], new Set(), TODAY).length, 0);
    assert.equal(dueList([row({ projected_date: "2027-04-01" })], new Set(), TODAY).length, 0);
  });

  it("skips a row with no date at all rather than dating it today", () => {
    // A roster row, or a condition the season has not met. Neither is due.
    assert.deepEqual(dueList([row({})], new Set(), TODAY), []);
  });

  it("knows which cycles can be started again", () => {
    assert.equal(repeatable([saved({ driver: "interval", days: 21 })]), true);
    assert.equal(repeatable([saved({ driver: "calendar" })]), false);
    assert.equal(repeatable([]), false);
  });
});
