// Run: node --experimental-strip-types --test src/lib/lifeCycle.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aboutDate, eventKey, heatStages, initialChoice, pestRow, pestWithStages, toAdd, trackedFor, wildlifeRows,
} from "./lifeCycle.ts";
import { makeWildlife } from "./wildlifeModels.ts";
import type { LifeCycleEvent } from "./mcp.ts";

const ev = (name: string, extra: Partial<LifeCycleEvent> = {}): LifeCycleEvent => ({
  name, emoji: null, summary: "", key: false, driver: "calendar", typical_on: "05-01",
  source_url: null, on_this_plot: "2026-05-01", ...extra,
});

const HAWK = [
  ev("Courtship flights", { key: true, driver: "daylight", daylight_hours: 11, rising: true, typical_on: undefined }),
  ev("First eggs", { key: true, typical_on: "03-28", emoji: "🥚", summary: "Two or three eggs." }),
  ev("Young disperse", { typical_on: "09-20" }),
  ev("Spring chorus", { driver: "moon", phase: "full", after: "03-01", typical_on: undefined }),
];

describe("choosing", () => {
  it("starts with the key events and whatever is already tracked", () => {
    const tracked = new Set([eventKey("young disperse")]);
    assert.deepEqual([...initialChoice(HAWK, tracked)].sort(),
      ["courtship flights", "first eggs", "young disperse"]);
  });

  it("adds only what is chosen and not yet tracked", () => {
    const tracked = new Set(["first eggs"]);
    const chosen = new Set(["courtship flights", "first eggs", "spring chorus"]);
    assert.deepEqual(toAdd(HAWK, chosen, tracked).map((e) => e.name), ["Courtship flights", "Spring chorus"]);
  });

  it("treats spacing and case as one name", () => assert.equal(eventKey("  First   Flight "), "first flight"));

  it("knows what an animal already has, however its name was spelled", () => {
    const recorded = [
      { species: "Red-tailed  hawk", event: "First Eggs" },
      { species: "Red-tailed Hawk", event: "" },
      { species: "Barn owl", event: "first eggs" },
    ];
    assert.deepEqual([...trackedFor(recorded, "red-tailed hawk")], ["first eggs"]);
  });

  it("reads a date as about that day", () => {
    assert.equal(aboutDate("2026-03-04"), "~Mar 4");
    assert.equal(aboutDate(null), "");
  });
});

describe("saving an animal's events", () => {
  it("makes one wildlife record per event, each passing the form's own check", () => {
    const rows = wildlifeRows("Red-tailed Hawk", HAWK, "b1", { scientificName: "Buteo jamaicensis" });
    assert.equal(rows.length, 4);
    for (const r of rows) assert.notEqual(typeof makeWildlife(r, "b1"), "string", r.event);
    assert.equal(rows[1].note, "Two or three eggs.");
    assert.equal(rows[3].phase, "full");
    assert.equal(new Set(rows.map((r) => r.id)).size, 4);
  });
});

describe("saving a plant's or pest's stages", () => {
  const PUMPKIN = [
    ev("harvest", { driver: "heat", gdd: 1750, key: true, emoji: "🎃", typical_on: undefined }),
    ev("emergence", { driver: "heat", gdd: 120, typical_on: undefined }),
    ev("by the calendar", {}),
  ];

  it("keeps the heat stages, sorted by heat", () => {
    assert.deepEqual(heatStages(PUMPKIN), [
      { stage: "emergence", gdd: 120 },
      { stage: "harvest", gdd: 1750, emoji: "🎃", key: true },
    ]);
  });

  it("makes one pest record holding every chosen stage at the pest's base", () => {
    const row = pestRow("Codling moth", PUMPKIN, 50, "b1", { taxonId: 81582 });
    assert.equal(row.base_temp, 50);
    assert.deepEqual(row.stages, [{ stage: "emergence", gdd: 120 }, { stage: "harvest", gdd: 1750 }]);
    assert.equal(row.taxon_id, 81582);
  });
});

describe("adding stages to a pest already watched", () => {
  const chosen = [
    ev("first flight", { driver: "heat", gdd: 375, typical_on: undefined }),
    ev("second flight", { driver: "heat", gdd: 1400, typical_on: undefined }),
  ];
  const existing = { id: "pe1", regionId: "b1", pest: "Codling moth", base_temp: 50,
    stages: [{ stage: "First flight", gdd: 380 }] };

  it("merges new stages into the one record, keeping what it had", () => {
    const got = pestWithStages(existing as never, "Codling moth", chosen, 50, "b1");
    assert.ok(typeof got !== "string");
    assert.equal(got.id, "pe1");
    assert.deepEqual(got.stages.map((s) => s.stage), ["First flight", "second flight"]);
  });

  it("turns a watch into a tracked pest", () => {
    const watch = { id: "pe2", regionId: "b1", pest: "Codling moth", watch: true, stages: [] };
    const got = pestWithStages(watch as never, "Codling moth", chosen, 50, "b1");
    assert.ok(typeof got !== "string" && !got.watch && got.base_temp === 50 && got.stages.length === 2);
  });

  it("says so, rather than mixing two bases on one record", () => {
    assert.equal(typeof pestWithStages(existing as never, "Codling moth", chosen, 43, "b1"), "string");
  });

  it("makes a new record when the pest is not watched yet", () => {
    const got = pestWithStages(undefined, "Codling moth", chosen, 50, "b1");
    assert.ok(typeof got !== "string" && got.id !== "pe1");
  });
});
