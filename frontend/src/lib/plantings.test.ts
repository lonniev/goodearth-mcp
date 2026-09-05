// A crop's icon is looked up from free text a grower typed, so the lookup has
// to survive successions, qualifiers, and names the catalogue never had.
//
// Run: node --experimental-strip-types --test src/lib/plantings.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makePlanting, plantingCodec, plantingDateFor } from "./plantings.ts";

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

describe("the scientific name survives the round trip to the record", () => {
  // A name held only in the browser is a name the server never sees, and the
  // server is where USA-NPN gets asked. Assert the wire shape, not the object
  // in hand — the field is snake_case on the record and camelCase in the app,
  // and a mismatch there loses it silently on the way out.
  it("goes out as scientific_name", () => {
    const wire = plantingCodec.to({
      id: "pl-1", crop: "Maple · sugar", setOut: "", regionId: "b1",
      perennial: true, hardyToF: -40, scientificName: "Acer saccharum",
    });
    assert.equal(wire.scientific_name, "Acer saccharum");
  });

  it("comes back from scientific_name", () => {
    const row = plantingCodec.from({
      item_id: "pl-1", block_id: "b1", crop: "Maple · sugar",
      scientific_name: "Acer saccharum",
    });
    assert.equal(row.scientificName, "Acer saccharum");
  });

  it("stays absent rather than becoming an empty string", () => {
    // A blank binomial would be asked about, and USA-NPN would be sent a
    // query for nothing.
    const wire = plantingCodec.to({
      id: "pl-2", crop: "Honeycrisp", setOut: "", regionId: "b1",
    });
    assert.equal("scientific_name" in wire, false);
    assert.equal(plantingCodec.from({
      item_id: "pl-2", block_id: "b1", crop: "Honeycrisp",
    }).scientificName, undefined);
  });
});


describe("no catalogue of living things comes back", () => {
  // This fault has now happened twice: a list of plants typed into a source
  // file, capping what a grower may grow to what one afternoon of research
  // thought of, and stating agronomy this service is in no position to state.
  // It is cheap to reintroduce and invisible in review, so it gets a test
  // rather than a comment.
  //
  // Reads the shipped modules rather than a count of them, because a test that
  // restates a number goes green while the file it describes drifts.
  it("ships no array of named organisms", async () => {
    // Guarding on the SHAPE of the fault, not on the look of a word. An
    // earlier version of this test grepped for "Genus species" and flagged
    // almanac.py, whose WMO table holds "Light drizzle" — same shape, not a
    // species. What actually went wrong was an array of rows each naming a
    // living thing, so that is what this counts.
    const { readdir, readFile } = await import("node:fs/promises");
    // The key must be followed by a quoted VALUE. `crop: string` is an
    // interface declaring a field; `crop: "Tomato"` is a row of a catalogue,
    // and only the second is the fault.
    const KEYS = /\b(crop|species|tree|pest|plant|scientificName|scientific_name|commonName)\s*:\s*["'`]/g;
    const offenders: string[] = [];

    for (const root of ["src/lib", "src/views", "src/components"]) {
      let names: string[];
      try { names = await readdir(root); } catch { continue; }
      for (const f of names) {
        if (!/\.(ts|tsx)$/.test(f) || f.includes(".test.")) continue;
        const txt = await readFile(`${root}/${f}`, "utf8");
        // Object literals in this file that name a living thing. A handful is
        // a type, a fixture or a worked example; dozens is a catalogue.
        const rows = (txt.match(KEYS) ?? []).length;
        if (rows > 12) offenders.push(`${root}/${f} (${rows})`);
      }
    }
    assert.deepEqual(offenders, [],
      `these look like a species catalogue typed into a source file: ${offenders.join(", ")}`);
  });

  it("bakes no literal year into a fallback", async () => {
    // `curve.season_start ?? "2026-01-01"` dated every calendar event into
    // 2026 for any later season that reached it.
    const { readdir, readFile } = await import("node:fs/promises");
    const offenders: string[] = [];
    for (const root of ["src/lib", "src/views", "src/components"]) {
      let names: string[];
      try { names = await readdir(root); } catch { continue; }
      for (const f of names) {
        if (!/\.(ts|tsx)$/.test(f) || f.includes(".test.")) continue;
        const txt = await readFile(`${root}/${f}`, "utf8");
        for (const m of txt.match(/\?\?\s*["'](19|20)\d{2}-/g) ?? []) {
          offenders.push(`${root}/${f}: ${m.trim()}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
