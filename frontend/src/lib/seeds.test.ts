// Seed lots — the packet's figures, checked the way the server checks them.
// Run: node --experimental-strip-types --test src/lib/seeds.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftFromLot, lotLine, lotsFor, makeSeedLot, onHand, seedCodec,
  type SeedLot } from "./seeds.ts";
import { BUNDLE_KINDS } from "./farmBundle.ts";

const lot = (over: Partial<SeedLot> = {}): SeedLot => ({ id: "se-1", crop: "Zinnia", ...over });

describe("a seed lot from the form", () => {
  it("names its crop", () => {
    assert.equal(makeSeedLot({ crop: "  " }), "Name the crop this is seed of.");
  });

  it("keeps what was typed, trimmed, and leaves the blanks out", () => {
    const made = makeSeedLot({
      crop: " Zinnia ", variety: "Benary's Giant", daysToMaturity: "75",
      germinationPct: "88", testedOn: "2026-02-01", packedFor: "2026", quantity: "500",
      unit: "seeds", source: "", lot: " Z-114 ",
    }, "se-x");
    assert.deepEqual(made, {
      id: "se-x", crop: "Zinnia", variety: "Benary's Giant", daysToMaturity: 75,
      germinationPct: 88, testedOn: "2026-02-01", packedFor: 2026, quantity: 500,
      unit: "seeds", lot: "Z-114",
    });
  });

  it("refuses a figure that could not be true, as the server does", () => {
    assert.match(String(makeSeedLot({ crop: "Kale", germinationPct: "140" })), /percentage/);
    assert.match(String(makeSeedLot({ crop: "Kale", daysToMaturity: "0" })), /Days to maturity/);
    assert.match(String(makeSeedLot({ crop: "Kale", daysToMaturity: "seventy" })), /Days to maturity/);
    assert.match(String(makeSeedLot({ crop: "Kale", packedFor: "26" })), /year/);
    assert.match(String(makeSeedLot({ crop: "Kale", quantity: "-2" })), /0 or more/);
    assert.match(String(makeSeedLot({ crop: "Kale", testedOn: "Feb" })), /YYYY-MM-DD/);
  });

  it("puts no ceiling on how much seed a grower holds", () => {
    assert.equal((makeSeedLot({ crop: "Kale", quantity: "10000000" }) as SeedLot).quantity, 10_000_000);
  });
});

describe("a seed lot on the record", () => {
  it("round-trips through the codec", () => {
    const l = lot({ variety: "Benary's Giant", daysToMaturity: 75, germinationPct: 88,
      testedOn: "2026-02-01", packedFor: 2026, quantity: 500, unit: "seeds",
      source: "a seed house", lot: "Z-114", taxonId: 47604 });
    const stored = seedCodec.to(l);
    assert.equal(stored.source, undefined, "the record's own `source` column is not the supplier");
    assert.deepEqual(seedCodec.from({ ...stored, kind: "seed" } as never), l);
  });
});

describe("which lots are seed of a crop", () => {
  const lots = [
    lot({ id: "a", crop: "Zinnia" }),
    lot({ id: "b", crop: "zinnia", variety: "State Fair" }),
    lot({ id: "c", crop: "Kale", taxonId: 1 }),
  ];

  it("a succession sows from its crop's packet", () => {
    assert.deepEqual(lotsFor("Zinnia · succession 3", undefined, lots).map((l) => l.id), ["a", "b"]);
  });

  it("the same plant, when both know it, whatever it is called", () => {
    assert.deepEqual(lotsFor("Lacinato", 1, lots).map((l) => l.id), ["c"]);
  });

  it("nothing for a crop with no seed on the shelf", () => {
    assert.deepEqual(lotsFor("Tomato", undefined, lots), []);
  });
});

describe("a lot in words", () => {
  it("says what the packet says, and nothing it does not", () => {
    assert.equal(
      lotLine(lot({ variety: "Benary's Giant", daysToMaturity: 75, germinationPct: 88, testedOn: "2026-02-01" })),
      "Benary's Giant · 75 days · 88% germination (tested Feb 2026)",
    );
    assert.equal(lotLine(lot()), "");
    assert.equal(onHand(lot({ quantity: 1500, unit: "seeds" })), "1,500 seeds");
  });
});

describe("sowing a lot", () => {
  it("makes the variety the grower's own name for the planting", () => {
    assert.equal(draftFromLot(lot({ variety: "Benary's Giant Mix" })).label, "Benary's Giant Mix");
    assert.equal(draftFromLot(lot()).label, "");
    assert.equal(draftFromLot(lot()).searchFor, "Zinnia");
  });

  it("never turns the packet's days into a heat target — different clocks", () => {
    const d = draftFromLot(lot({ daysToMaturity: 75 }));
    assert.equal(d.gddTargetF, undefined);
  });

  it("carries the packet's plant and nothing it did not state", () => {
    // Reached only for a packet the ledger has no plant for, so there is no
    // row to take a heat target or a base temperature from. Inventing either
    // is the thing this must not do.
    assert.deepEqual(draftFromLot(lot({ taxonId: 3 })), {
      label: "", frostHardy: false, taps: false, taxonId: 3, searchFor: "Zinnia",
    });
  });
});

describe("the seed kind, end to end", () => {
  it("is a kind the server declares, the page types, and a bundle carries", () => {
    const py = readFileSync(new URL("../../../src/goodearth_mcp/block_store.py", import.meta.url), "utf8");
    const kinds = [...(py.match(/^KINDS = \(([^)]*)\)/m)?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const ts = readFileSync(new URL("./mcp.ts", import.meta.url), "utf8");
    const typed = ts.match(/export type ItemKind = ([^;]*);/)?.[1] ?? "";
    assert.ok(kinds.includes("seed"));
    for (const k of kinds) assert.ok(typed.includes(`"${k}"`), `ItemKind is missing ${k}`);
    assert.ok((BUNDLE_KINDS as readonly string[]).includes("seed"));
  });

  it("a packet is stated on its plant's own row, not in a section of its own", () => {
    // The redundancy this replaced: a Seeds section with a dropdown re-picking
    // a plant the ledger already had on screen, and a saved lot whose only
    // gesture was a jump back to the add-form to create a SECOND row for a
    // plant that was already there.
    const ledger = readFileSync(new URL("../components/CropLedger.tsx", import.meta.url), "utf8");
    const crops = readFileSync(new URL("../views/Crops.tsx", import.meta.url), "utf8");
    assert.match(ledger, /<SeedRow[\s\S]*?onBind=/);
    assert.match(crops, /<CropLedger[\s\S]*?seeding=\{\{/);
    assert.doesNotMatch(crops, /title="Seeds on hand"/);
    assert.match(crops, /title="When to sow"/);
  });

  it("the form asks for a packet, never for the plant it is already on", () => {
    const form = readFileSync(new URL("../components/SeedForm.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(form, /name="crop"/);
    assert.doesNotMatch(form, /seed-crops/);
  });

  it("asks how much once, not as two fields of the same thought", () => {
    // "500" and "seeds" are two halves of one answer. Two separately-labelled
    // boxes made the grower say it twice.
    const form = readFileSync(new URL("../components/SeedForm.tsx", import.meta.url), "utf8");
    assert.match(form, /<QuantityField[\s\S]*?label="Inventory count"/);
    assert.doesNotMatch(form, /name="qty"/);
    assert.doesNotMatch(form, /name="unit"/);
  });

  it("names what was tested, and who the lot number belongs to", () => {
    // "Tested on" beside a date said nothing about WHAT was tested, and "Lot"
    // alone could as easily have meant the grower's own numbering.
    const form = readFileSync(new URL("../components/SeedForm.tsx", import.meta.url), "utf8");
    assert.match(form, /Germination tested/);
    assert.match(form, /Supplier’s lot/);
    assert.doesNotMatch(form, /^\s*Tested on$/m);
  });

  it("draws its marks in the page's ink, not in Apple's", () => {
    // A colour emoji beside monochrome Material glyphs reads as something
    // pasted in, and it cannot take the ink of the button it sits in.
    const ledger = readFileSync(new URL("../components/CropLedger.tsx", import.meta.url), "utf8");
    // The two this ledger draws: a seed and a cut. Other marks on the page
    // are a different question and keep their emoji until they are asked
    // about — this pins what was, not everything that could be.
    assert.doesNotMatch(ledger, /\u{1F330}|\u2702/u);
    assert.match(ledger, /<Glyph path=\{ICON\.seed\}/);
    assert.match(ledger, /<Glyph path=\{ICON\.cut\}/);
  });

  it("puts every control for the form in one place", () => {
    // They were scattered: a toggle in the middle of the fields, a save and a
    // cancel after them, and the add button in the far corner of a second box.
    const ledger = readFileSync(new URL("../components/CropLedger.tsx", import.meta.url), "utf8");
    const cluster = ledger.match(/<div className="flex shrink-0 items-center[\s\S]*?<\/div>/)?.[0] ?? "";
    for (const want of [/ICON\.add/, /TrashGlyph/, /ICON\.cancelEdit/, /✓/]) {
      assert.match(cluster, want, `the control cluster is missing ${want}`);
    }
    // And the packet form no longer carries a submit of its own.
    const form = readFileSync(new URL("../components/SeedForm.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(form, /IconButton/);
  });

  it("lines its fields up by construction, not by hand", () => {
    // Captions at three heights and boxes at four is what a form looks like
    // when each field wears its own markup. One component, one caption row
    // height, one control height.
    const form = readFileSync(new URL("../components/SeedForm.tsx", import.meta.url), "utf8");
    const fields = form.match(/<Field |<QuantityField /g) ?? [];
    assert.ok(fields.length >= 7, `expected every field through the component, saw ${fields.length}`);
    assert.doesNotMatch(form, /className={CELL}/);
  });

  it("does not name the plant inside the plant's own row", () => {
    const ledger = readFileSync(new URL("../components/CropLedger.tsx", import.meta.url), "utf8");
    const row = ledger.slice(ledger.indexOf("function SeedRow"), ledger.indexOf("function HarvestRow"));
    assert.doesNotMatch(row, /\{planting\.crop\}</, "the row hangs under the plant's own name");
  });

  it("shows at a glance which plants have seed on the shelf", () => {
    // The ledger is read down a column. Without this the only way to learn
    // which rows hold a packet was to open every one of them in turn.
    const ledger = readFileSync(new URL("../components/CropLedger.tsx", import.meta.url), "utf8");
    const row = ledger.slice(ledger.indexOf("{seeding && (()"), ledger.indexOf("{harvesting && ("));
    assert.match(row, /seeding\.lotsFor\(p\)\.length > 0/);
    assert.match(row, /held \? "text-growth"/);
  });

  it("the shelf records and never advises", () => {
    const src = [
      readFileSync(new URL("../components/SeedForm.tsx", import.meta.url), "utf8"),
      readFileSync(new URL("./seeds.ts", import.meta.url), "utf8"),
    ].join("\n").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\b(should sow|you should|recommend|discard|throw (it|them) out|too old|sow extra|over-?sow)\b/i);
  });
});
