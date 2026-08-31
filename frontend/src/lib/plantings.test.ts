// A crop's icon is looked up from free text a grower typed, so the lookup has
// to survive successions, qualifiers, and names the catalogue never had.
//
// Run: node --experimental-strip-types --test src/lib/plantings.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emojiFor, plantingDateFor } from "./plantings.ts";

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
