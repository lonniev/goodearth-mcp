// What grew here, season by season, by family — stated as fact.
// Run: node --experimental-strip-types --test src/lib/rotation.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromRow, rotation, type Family } from "./rotation.ts";
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

describe("rotation states the record and never advises", () => {
  it("has no words of instruction", () => {
    const src = readFileSync(new URL("../components/RotationPanel.tsx", import.meta.url), "utf8")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\b(should|avoid|recommend|don'?t plant|rotate (to|into)|move (it|them))\b/i);
  });
});
