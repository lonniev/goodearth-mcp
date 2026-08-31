// A crop's icon is looked up from free text a grower typed, so the lookup has
// to survive successions, qualifiers, and names the catalogue never had.
//
// Run: node --experimental-strip-types --test src/lib/plantings.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CROP_PRESETS, emojiFor, plantingDateFor } from "./plantings.ts";

describe("emojiFor — marks a row without guessing", () => {
  it("matches a preset by name", () => {
    assert.equal(emojiFor("Potato"), "🥔");
    assert.equal(emojiFor("Lisianthus"), "💐");
  });

  it("ignores case and surrounding space", () => {
    assert.equal(emojiFor("  potato "), "🥔");
  });

  it("finds the crop inside a succession a grower typed", () => {
    // The real shape of the field: nobody writes the preset key back.
    assert.equal(emojiFor("Zinnia · succession 4"), "🌼");
    assert.equal(emojiFor("Sunflower · ProCut, second sowing"), "🌻");
  });

  it("matches whole words only", () => {
    // "corn" inside "cornflower" must not claim a corn row. No preset head is
    // the bare word, so the seedling is the honest answer here.
    assert.equal(emojiFor("Cornflower"), "🌱");
  });

  it("falls back to a seedling rather than guessing", () => {
    assert.equal(emojiFor("Fiddlehead fern"), "🌱");
    assert.equal(emojiFor(""), "🌱");
    assert.equal(emojiFor("   "), "🌱");
  });

  it("prefers the longer head when two could match", () => {
    // "Field corn" and "Silage corn" both end in corn; the row says which.
    assert.equal(emojiFor("Silage corn"), "🌽");
    assert.equal(emojiFor("Field corn · long season"), "🌽");
  });
});

describe("plantingDateFor — never backdates the heat", () => {
  const today = "2026-08-31";

  it("takes the out date while the window is still ahead", () => {
    assert.equal(plantingDateFor("2026-09-15", today), "2026-09-15");
  });

  it("falls back to today once the window has passed", () => {
    // Garlic's window opened in April. An August tap did not plant it then,
    // and dating it there would hand the ledger five months of heat the crop
    // was never in the ground for.
    assert.equal(plantingDateFor("2026-04-06", today), today);
  });

  it("uses today when the row has no out date", () => {
    assert.equal(plantingDateFor(null, today), today);
    assert.equal(plantingDateFor(undefined, today), today);
    assert.equal(plantingDateFor("", today), today);
  });

  it("does not treat today's own date as ahead", () => {
    assert.equal(plantingDateFor(today, today), today);
  });
});

describe("CROP_PRESETS — invariants the UI relies on", () => {
  it("has no duplicate crop name", () => {
    // The name is the React key AND the join key against the tool's rows.
    // A duplicate shadows silently: one chiclet renders, the other's verdict
    // is quietly the first one's.
    const seen = new Map<string, number>();
    for (const c of CROP_PRESETS) seen.set(c.crop, (seen.get(c.crop) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
    assert.deepEqual(dupes, []);
  });

  it("gives every preset a target, a base and a category", () => {
    for (const c of CROP_PRESETS) {
      assert.ok(c.gddTarget > 0, `${c.crop} has no target`);
      assert.ok(c.baseTempF > 0, `${c.crop} has no base`);
      assert.ok(c.emoji, `${c.crop} has no icon`);
      assert.ok(c.note, `${c.crop} has no note`);
    }
  });

  it("never marks a crop both frost-hardy and warm-soil", () => {
    // Contradictory flags would put a crop out before the last frost and then
    // hold it back for 60°F soil — two rules that cannot both be the answer.
    for (const c of CROP_PRESETS) {
      if (c.frostHardy) {
        assert.ok((c.minSoilF ?? 0) <= 55,
          `${c.crop} is frost-hardy but waits on ${c.minSoilF}°F soil`);
      }
    }
  });

  it("keeps the flower bench worth calling a bench", () => {
    // It shipped with six, which said more about who wrote the list than
    // about what grows in a cold-climate cut garden.
    const flowers = CROP_PRESETS.filter((c) => c.category === "flower");
    assert.ok(flowers.length >= 20, `only ${flowers.length} flowers`);
    assert.ok(flowers.some((c) => c.frostHardy), "no hardy annuals");
    assert.ok(flowers.some((c) => !c.frostHardy), "no tender annuals");
  });
});
