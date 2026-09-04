// A crop's icon is looked up from free text a grower typed, so the lookup has
// to survive successions, qualifiers, and names the catalogue never had.
//
// Run: node --experimental-strip-types --test src/lib/plantings.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CROP_PRESETS, emojiFor, HEAT_RATED, makePlanting, plantingDateFor,
  WINTER_RATED } from "./plantings.ts";

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

  it("pairs a heat target with a base temperature, both ways", () => {
    // One without the other is unusable: a target with no base cannot be
    // accumulated, and a base with no target has nothing to count toward.
    for (const c of CROP_PRESETS) {
      assert.equal(c.gddTarget != null, c.baseTempF != null,
        `${c.crop} carries one of target/base without the other`);
    }
  });

  it("gives every preset an icon and a note field", () => {
    for (const c of CROP_PRESETS) {
      assert.ok(c.emoji, `${c.crop} has no icon`);
      assert.equal(typeof c.note, "string", `${c.crop} has no note`);
    }
  });

  it("gives every perennial the hardiness figure it is judged on", () => {
    for (const c of WINTER_RATED) {
      assert.ok(c.hardyToF != null, `${c.crop} has no hardiness figure`);
    }
  });

  it("gives winter figures to NOTHING that is not a perennial", () => {
    // A chill requirement on a zinnia would be sent to a tool that rates it
    // across winters it does not live through.
    for (const c of CROP_PRESETS) {
      if (c.perennial) continue;
      assert.equal(c.chillHours, undefined, `${c.crop} carries chill hours`);
      assert.equal(c.hardyToF, undefined, `${c.crop} carries a hardiness figure`);
    }
  });

  it("lets the two ratings OVERLAP rather than partition the library", () => {
    // The error that kept perennials out in the first place was assuming a
    // plant could only be one kind of thing. Alfalfa is a perennial stand that
    // also answers 750 GDD per cutting, and both are true of it.
    const both = CROP_PRESETS.filter((c) => c.perennial && c.gddTarget != null);
    assert.ok(both.length > 0, "nothing is rated on both heat and winter");
    for (const c of both) {
      assert.ok(HEAT_RATED.includes(c), `${c.crop} is not asked its heat question`);
      assert.ok(WINTER_RATED.includes(c), `${c.crop} is not asked its winter question`);
    }
  });

  it("sends nothing to a call that would have to invent its figure", () => {
    for (const c of HEAT_RATED) assert.ok(c.gddTarget != null && c.baseTempF != null, c.crop);
    for (const c of WINTER_RATED) assert.ok(c.perennial, c.crop);
  });

  it("carries perennials in every category a grower browses, not a ghetto", () => {
    // The whole correction. They were absent from the catalogue on a rule that
    // was one afternoon's working decision; they belong wherever the plant
    // belongs, beside the annuals a grower is choosing between.
    const cats = new Set(WINTER_RATED.map((c) => c.category));
    for (const want of ["flower", "vegetable", "herb", "orchard", "forest", "field", "cover"]) {
      assert.ok(cats.has(want as never), `no perennial in ${want}`);
    }
  });

  it("gives every fruit tree and bush the two figures it is judged on", () => {
    const fruit = WINTER_RATED.filter((c) => c.category === "orchard");
    assert.ok(fruit.length >= 25, `only ${fruit.length} fruit entries`);
    for (const c of fruit) {
      assert.ok(c.chillHours != null, `${c.crop} has no chill figure`);
      assert.ok(c.hardyToF != null, `${c.crop} has no hardiness figure`);
    }
  });

  it("gives every forest tree a hardiness figure and no chill one", () => {
    // A forest tree is not being asked to set fruit, so a chill requirement
    // for it would be a number invented to fill a column.
    const forest = WINTER_RATED.filter((c) => c.category === "forest");
    assert.ok(forest.length >= 10, `only ${forest.length} forest trees`);
    for (const c of forest) {
      assert.ok(c.hardyToF != null, `${c.crop} has no hardiness figure`);
      assert.equal(c.chillHours, undefined, `${c.crop} carries a chill requirement`);
    }
  });

  it("keeps every perennial figure inside what the server will accept", () => {
    // The server validates -60..40 °F and 0..2000 hours. A preset outside
    // those is refused on the wire, which reads as a broken page.
    for (const c of WINTER_RATED) {
      if (c.hardyToF != null) assert.ok(c.hardyToF >= -60 && c.hardyToF <= 40, c.crop);
      if (c.chillHours != null) assert.ok(c.chillHours >= 0 && c.chillHours <= 2000, c.crop);
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


describe("makePlanting — a perennial is a planting too", () => {
  it("refuses an annual with no target, as it always has", () => {
    assert.equal(typeof makePlanting("Zinnia", undefined, "2026-05-20", "b1"), "string");
  });

  it("refuses an annual with no set-out", () => {
    assert.equal(typeof makePlanting("Zinnia", 1100, "", "b1"), "string");
  });

  it("accepts a perennial with neither", () => {
    // "There is an apple tree by the barn" is a true thing to record. Until
    // now the only way to save one was to enter an annual and edit both
    // fields back out afterwards.
    const made = makePlanting("Apple", undefined, "", "b1", undefined,
      { perennial: true, chillHours: 800, hardyToF: -30 });
    assert.notEqual(typeof made, "string");
    if (typeof made === "string") return;
    assert.equal(made.perennial, true);
    assert.equal(made.chillHours, 800);
    assert.equal(made.gddTarget, undefined);
    assert.equal(made.setOut, "");
  });

  it("still refuses figures the server would refuse", () => {
    for (const extra of [{ perennial: true, chillHours: 9_000 },
                         { perennial: true, hardyToF: -200 }]) {
      assert.equal(typeof makePlanting("Apple", undefined, "", "b1", undefined, extra),
        "string");
    }
  });

  it("keeps a set-out on a perennial that has one", () => {
    // A tree planted in 2019 knows its date; a hedgerow that was here first
    // does not. Both are perennials.
    const made = makePlanting("Apple", undefined, "2019-04-12", "b1", undefined,
      { perennial: true });
    assert.notEqual(typeof made, "string");
    if (typeof made === "string") return;
    assert.equal(made.setOut, "2019-04-12");
  });
});

describe("the tree library reads as a grower would name it", () => {
  it("finds an icon for every perennial by name", () => {
    for (const c of WINTER_RATED) assert.equal(emojiFor(c.crop), c.emoji);
  });

  it("does not let one head term claim an unrelated plant", () => {
    // "Cherry · black" is a forest tree and "Cherry · sweet" an orchard one;
    // the head-term match must not collapse them into whichever came first.
    assert.ok(CROP_PRESETS.every((c) => c.crop !== "Cherry"));
  });
});
