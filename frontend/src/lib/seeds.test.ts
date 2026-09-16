// Seed lots — the packet's figures, checked the way the server checks them.
// Run: node --experimental-strip-types --test src/lib/seeds.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftFromLot, lotLine, lotsFor, makeSeedLot, needsTarget, onHand, seedCodec,
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

  it("carries the crop's own figures when the ledger already has them", () => {
    const d = draftFromLot(lot({ taxonId: 3 }), {
      gddTarget: 900, baseTempF: 45, frostHardy: true, commonName: "Zinnia",
    });
    assert.deepEqual(d, {
      label: "", gddTargetF: 900, baseTempF: 45, frostHardy: true, taps: false,
      taxonId: 3, commonName: "Zinnia", searchFor: "Zinnia",
    });
  });
});

describe("which seed When to sow cannot date", () => {
  const lots = [
    lot({ id: "a", crop: "Zinnia", daysToMaturity: 75 }),
    lot({ id: "b", crop: "Zinnia", daysToMaturity: 80 }),
    lot({ id: "c", crop: "Kale", daysToMaturity: 60 }),
    lot({ id: "d", crop: "Sweet pea" }),
  ];

  it("names each crop once, in order, and only where the packet gave days", () => {
    // Kale is dated; Sweet pea has no days on the packet, so nothing is missing.
    assert.deepEqual(needsTarget(lots, (c) => c === "Kale"), ["Zinnia"]);
  });

  it("says nothing when every crop is dated", () => {
    assert.deepEqual(needsTarget(lots, () => true), []);
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

  it("a lot is a way onto the ledger, and the two sections name their question", () => {
    const shelf = readFileSync(new URL("../components/SeedShelf.tsx", import.meta.url), "utf8");
    const crops = readFileSync(new URL("../views/Crops.tsx", import.meta.url), "utf8");
    assert.match(shelf, /onClick=\{\(\) => onSow\(l\)\}/);
    assert.match(crops, /<SeedShelf[\s\S]*?onSow=/);
    assert.match(crops, /title="Seeds on hand"/);
    assert.match(crops, /title="When to sow"/);
  });

  it("the shelf records and never advises", () => {
    const src = [
      readFileSync(new URL("../components/SeedShelf.tsx", import.meta.url), "utf8"),
      readFileSync(new URL("./seeds.ts", import.meta.url), "utf8"),
    ].join("\n").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\b(should sow|you should|recommend|discard|throw (it|them) out|too old|sow extra|over-?sow)\b/i);
  });
});
