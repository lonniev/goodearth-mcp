// Run: node --experimental-strip-types --test src/lib/refreshRow.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTaken, lookupBy, pestDiff, plantingDiff, wildlifeDiff } from "./refreshRow.ts";
import type { LifeCycleEvent, LifeCycleResult, PlantProfileResult } from "./mcp.ts";
import type { Planting } from "./plantings.ts";
import type { SavedPest } from "./pestModels.ts";
import type { SavedWildlife } from "./wildlifeModels.ts";

const F = { temp: (f: number) => `${f}°F`, dd: (n: number) => `${n} GDD` };
const C = { temp: (f: number) => `${Math.round(((f - 32) * 5) / 9)}°C`, dd: (n: number) => `${Math.round((n * 5) / 9)} GDD°C` };

const pumpkin: PlantProfileResult = {
  success: true,
  profile: {
    scientific_name: "Cucurbita pepo", common_name: "Pumpkin", family: "Cucurbitaceae", kind: "annual",
    days_to_maturity: { typical: 100, low: 90, high: 120, counted_from: "sowing" },
    published_gdd: null, base_temp_f: 50, height_in: { typical: 18.4, low: 12, high: 24 },
    flower_color: "yellow", bloom_months: [7, 8], frost_hardy: false,
    chill_hours: null, hardy_to_f: null, sources: [], notes: "",
  },
  on_this_plot: { gdd_target: 1840, base_temp_f: 50, basis: "days_to_maturity", bloom_months: [8, 7] },
};

const planting = (over: Partial<Planting> = {}): Planting =>
  ({ id: "pl1", crop: "Pumpkin", setOut: "2026-05-20", regionId: "r", ...over }) as Planting;

describe("a planting beside its profile", () => {
  it("offers only the figures that differ", () => {
    const p = planting({ gddTarget: 1840, baseTempF: 50, flowerColor: "yellow", heightIn: 18, bloomMonths: [7, 8] });
    assert.deepEqual(plantingDiff(p, pumpkin, F), []);
  });

  it("offers each missing or different figure, in the reader's scale", () => {
    const d = plantingDiff(planting({ gddTarget: 1500, frostHardy: true }), pumpkin, C);
    assert.deepEqual(d.map((x) => x.field), ["gddTarget", "baseTempF", "flowerColor", "heightIn", "bloomMonths", "frostHardy"]);
    assert.equal(d[0].yours, "833 GDD°C");
    assert.equal(d[0].ai, "1022 GDD°C");
    assert.equal(d[4].ai, "Jul Aug");
    assert.equal(d[5].ai, "no");
  });

  it("takes only what was picked, in the record's own units", () => {
    const p = planting({ gddTarget: 1500, heightIn: 30 });
    const d = plantingDiff(p, pumpkin, C);
    const out = applyTaken(p, d, new Set(["gddTarget"]));
    assert.equal(out.gddTarget, 1840);
    assert.equal(out.heightIn, 30);
    assert.equal(out.flowerColor, undefined);
  });

  it("keeping everything changes nothing", () => {
    const p = planting();
    assert.deepEqual(applyTaken(p, plantingDiff(p, pumpkin, F), new Set()), p);
  });

  it("offers chill and hardiness only on a perennial", () => {
    const tree: PlantProfileResult = { ...pumpkin, profile: { ...pumpkin.profile!, chill_hours: 800, hardy_to_f: -30 } };
    assert.ok(!plantingDiff(planting(), tree, F).some((x) => x.field === "chillHours"));
    const d = plantingDiff(planting({ perennial: true, chillHours: 600 }), tree, F);
    assert.ok(d.some((x) => x.field === "chillHours" && x.yours === "600 h" && x.ai === "800 h"));
    assert.ok(d.some((x) => x.field === "hardyToF" && x.ai === "-30°F"));
  });
});

const heat = (name: string, gdd: number): LifeCycleEvent =>
  ({ name, emoji: null, summary: "", key: true, driver: "heat", gdd, source_url: null, on_this_plot: null }) as LifeCycleEvent;

const beetle: LifeCycleResult = {
  success: true, base_temp_f: 50,
  events: [heat("Adult emergence", 970), heat("Peak flight", 1290),
    { ...heat("Mating", 0), driver: "calendar", gdd: undefined, typical_on: "07-01" }],
};

describe("a pest beside its life cycle", () => {
  it("compares the base and each heat stage by name, ignoring case", () => {
    const p = { id: "pe1", regionId: "r", pest: "Japanese beetle", base_temp: 50,
      stages: [{ stage: "adult EMERGENCE", gdd: 970 }, { stage: "Grub feeding", gdd: 400 }] } as SavedPest;
    const d = pestDiff(p, beetle, F);
    assert.deepEqual(d.map((x) => x.label), ["Peak flight"]);
    assert.equal(d[0].yours, "—");
  });

  it("adds a stage the row lacks, keeps the grower's own, and stops watching", () => {
    const p = { id: "pe1", regionId: "r", pest: "Japanese beetle", watch: true,
      stages: [{ stage: "Grub feeding", gdd: 400 }] } as SavedPest;
    const d = pestDiff(p, beetle, F);
    assert.deepEqual(d.map((x) => x.field), ["base_temp", "stage:adult emergence", "stage:peak flight"]);
    const out = applyTaken(p, d, new Set(["stage:peak flight"]));
    assert.equal(out.watch, undefined);
    assert.equal(out.base_temp, 50);
    assert.deepEqual(out.stages.map((s) => s.stage), ["Grub feeding", "Peak flight"]);
  });

  it("replaces a stage's figure under the grower's own spelling", () => {
    const p = { id: "pe1", regionId: "r", pest: "JB", base_temp: 50,
      stages: [{ stage: "peak flight", gdd: 1100 }] } as SavedPest;
    const d = pestDiff(p, beetle, F);
    const out = applyTaken(p, d, new Set(["stage:peak flight"]));
    assert.deepEqual(out.stages, [{ stage: "peak flight", gdd: 1290 }]);
  });
});

const robin: LifeCycleResult = {
  success: true,
  events: [
    { name: "Arrival", emoji: "🐦", summary: "First robins back", key: true, driver: "daylight",
      daylight_hours: 11.5, rising: true, source_url: null, on_this_plot: null },
  ],
};

const watch = (over: Partial<SavedWildlife> = {}): SavedWildlife =>
  ({ id: "wl1", regionId: "r", species: "American robin", event: "Arrival", driver: "daylight",
     daylight_hours: 11.5, rising: true, note: "First robins back", ...over }) as SavedWildlife;

describe("a Fauna row beside its creature's life cycle", () => {
  it("matches when the timing and note agree", () => {
    assert.deepEqual(wildlifeDiff(watch(), robin, F), []);
  });

  it("is null when the reference has no event of that name", () => {
    assert.equal(wildlifeDiff(watch({ event: "Nesting" }), robin, F), null);
  });

  it("takes a change of clock as one figure, dropping the old clock's fields", () => {
    const w = watch({ driver: "calendar", daylight_hours: undefined, rising: undefined, typical_on: "04-01" });
    const d = wildlifeDiff(w, robin, F)!;
    assert.deepEqual(d.map((x) => x.field), ["timing"]);
    assert.equal(d[0].yours, "date: 04-01");
    assert.equal(d[0].ai, "11.5 h rising");
    const out = applyTaken(w, d, new Set(["timing"]));
    assert.equal(out.driver, "daylight");
    assert.equal(out.typical_on, undefined);
    assert.equal(out.daylight_hours, 11.5);
    assert.equal(out.id, "wl1");
  });
});

describe("what a row is looked up by", () => {
  it("the picked taxon when there is one, else the typed name", () => {
    assert.deepEqual(lookupBy("Robin", { taxonId: 12727, scientificName: "Turdus migratorius" }),
      { taxon_id: 12727, scientific_name: "Turdus migratorius", common_name: "Robin" });
    assert.deepEqual(lookupBy("punkin", {}), { text: "punkin" });
  });
});
