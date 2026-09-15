// What grew here, season by season, by family — stated as fact.
// Run: node --experimental-strip-types --test src/lib/rotation.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromRow, repeatDraft, rotation, type Family } from "./rotation.ts";
import { familyFromTaxon } from "./family.ts";

const brassica: Family = { name: "Brassicaceae", common: "Cabbages and Mustards" };
const nightshade: Family = { name: "Solanaceae", common: "Nightshades" };
const families = new Map<number, Family>([[1, brassica], [2, brassica], [3, nightshade]]);
const row = (crop: string, extra: Record<string, unknown>) =>
  ({ item_id: crop, kind: "planting", crop, ...extra }) as never;

describe("reading a planting's season", () => {
  it("is the year it was set out", () => {
    assert.equal(fromRow(row("Kale", { set_out: "2025-05-01", season_year: 2024 })).season, 2025);
  });

  it("is the season the record filed it under when it has no set-out", () => {
    assert.equal(fromRow(row("Apple", { season_year: 2026 })).season, 2026);
  });

  it("counts a succession as its crop", () => {
    assert.equal(fromRow(row("Zinnia · succession 3", { set_out: "2026-06-01" })).crop, "Zinnia");
  });
});

describe("the rotation", () => {
  const plantings = [
    { crop: "Kale", season: 2025, taxonId: 1 },
    { crop: "Cabbage", season: 2026, taxonId: 2 },
    { crop: "Kale", season: 2026, taxonId: 1 },
    { crop: "Kale", season: 2026, taxonId: 1 },
    { crop: "Tomato", season: 2024, taxonId: 3 },
    { crop: "Mystery squash", season: 2026 },
  ];
  const rows = rotation(plantings, families);

  it("runs newest season first", () => {
    assert.deepEqual(rows.map((r) => r.season), [2026, 2025, 2024]);
  });

  it("groups a season's crops by family, each crop once", () => {
    const [y2026] = rows;
    assert.deepEqual(y2026.families.map((g) => [g.family, g.crops]), [["Brassicaceae", ["Cabbage", "Kale"]]]);
  });

  it("says which other seasons a family grew here, as a fact", () => {
    assert.deepEqual(rows[0].families[0].alsoIn, [2025]);
    assert.deepEqual(rows[2].families[0].alsoIn, []);
  });

  it("names a crop without a species rather than guessing its family", () => {
    assert.deepEqual(rows[0].unplaced, ["Mystery squash"]);
  });
});

describe("a family from iNaturalist", () => {
  it("is the taxon's ancestor ranked family", () => {
    assert.deepEqual(
      familyFromTaxon({ id: 55745, name: "Trifolium repens", rank: "species",
        ancestors: [{ rank: "order", name: "Fabales" }, { rank: "family", name: "Fabaceae", preferred_common_name: "Legumes" }] }),
      { name: "Fabaceae", common: "Legumes" },
    );
  });

  it("is the taxon itself when it is a family", () => {
    assert.deepEqual(familyFromTaxon({ id: 47604, name: "Asteraceae", rank: "family" }), { name: "Asteraceae" });
  });

  it("is nothing above the rank of family", () => {
    assert.equal(familyFromTaxon({ id: 47125, name: "Angiospermae", rank: "subphylum", ancestors: [] }), null);
  });
});

describe("planting a crop again", () => {
  const zinnia = fromRow(row("Zinnia · succession 3", {
    item_id: "pl-z", set_out: "2025-06-10", gdd_target: 900, base_temp: 45,
    frost_hardy: true, taxon_id: 3, common_name: "Zinnia", scientific_name: "Zinnia elegans",
  }));

  it("keeps the whole record, so the figures can carry over", () => {
    assert.equal(zinnia.planting?.gddTarget, 900);
    assert.equal(zinnia.planting?.baseTempF, 45);
  });

  it("carries the figures over, and never the day or the succession number", () => {
    const d = repeatDraft(zinnia);
    assert.deepEqual(d, {
      label: "", gddTargetF: 900, baseTempF: 45, frostHardy: true, taps: false,
      taxonId: 3, scientificName: "Zinnia elegans", commonName: "Zinnia", searchFor: "Zinnia",
    });
  });

  it("keeps the grower's own name when it is not the plant's", () => {
    const d = repeatDraft(fromRow(row("North lot kale", { set_out: "2025-05-01", gdd_target: 700, common_name: "Kale" })));
    assert.equal(d.label, "North lot kale");
  });

  it("searches for a crop the record names without a species", () => {
    const d = repeatDraft(fromRow(row("Mystery squash", { set_out: "2026-05-01" })));
    assert.equal(d.taxonId, undefined);
    assert.equal(d.searchFor, "Mystery squash");
  });

  it("repeats a crop's newest planting that season", () => {
    const rows = rotation([
      { crop: "Kale", season: 2026, taxonId: 1, planting: { id: "new" } as never },
      { crop: "Kale", season: 2026, taxonId: 1, planting: { id: "old" } as never },
      { crop: "Mystery squash", season: 2026 },
    ], families);
    assert.equal(rows[0].repeat.Kale.planting?.id, "new");
    assert.ok(rows[0].repeat["Mystery squash"], "an unplaced crop can be planted again too");
  });

  it("the panel's crops plant again, and Crops wires it to the add form", () => {
    const panel = readFileSync(new URL("../components/RotationPanel.tsx", import.meta.url), "utf8");
    const crops = readFileSync(new URL("../views/Crops.tsx", import.meta.url), "utf8");
    assert.match(panel, /onClick=\{\(\) => onRepeat\(from, r\.season\)\}/);
    assert.match(crops, /<RotationPanel[^>]*onRepeat=/);
  });
});

describe("rotation states the record and never advises", () => {
  it("has no words of instruction", () => {
    const src = readFileSync(new URL("../components/RotationPanel.tsx", import.meta.url), "utf8")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\b(should|avoid|recommend|don'?t plant|rotate (to|into)|move (it|them))\b/i);
  });
});
