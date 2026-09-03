// The views must read the grower's record, not this browser.
//
// Run: node --experimental-strip-types --test src/lib/record.test.ts
//
// This exists because of a real defect: the migration lifted every planting,
// pest, wildlife row and observation to the server and then cleared the
// browser key, while the views went on reading that emptied key. Nothing was
// lost — the server had all 28 plantings — but the app showed a farm with
// nothing on it. tsc, 104 unit tests and a clean build all passed, because
// none of them can see that a view is pointed at the wrong store.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// HeatLedger too: its flags fan in the same three collections.
const VIEWS = ["Crops", "Pests", "Wildlife", "FieldReports", "HeatLedger"] as const;

/// The device-local accessors. Their presence in a view means that view is
/// showing whatever this browser happens to hold.
const LOCAL_READERS = [
  "listPlantings", "savePlanting", "deletePlanting",
  "listPests", "savePest", "deletePest",
  "listWildlife", "saveWildlife", "deleteWildlife",
  "listReports", "saveReport", "deleteReport",
];

function source(view: string): string {
  return readFileSync(new URL(`../views/${view}.tsx`, import.meta.url), "utf8");
}

describe("the record views", () => {
  for (const view of VIEWS) {
    it(`${view} does not read the grower's data from localStorage`, () => {
      const src = source(view);
      const found = LOCAL_READERS.filter((fn) => new RegExp(`\\b${fn}\\b`).test(src));
      assert.deepEqual(
        found, [],
        `${view}.tsx still uses ${found.join(", ")} — it will show an empty ` +
        `farm once the migration clears that key`,
      );
    });

    it(`${view} reads the record through the server`, () => {
      assert.match(
        source(view), /useBlockItems/,
        `${view}.tsx does not read block items from the server`,
      );
    });
  }

  it("no lib module writes the migrated collections to localStorage", () => {
    // The one-time migration may still READ these keys to lift them; nothing
    // may write them back, or the browser becomes a second source of truth.
    for (const lib of ["plantings", "pestModels", "wildlifeModels", "reports"]) {
      const src = readFileSync(new URL(`./${lib}.ts`, import.meta.url), "utf8");
      assert.ok(
        !/localStorage\.setItem/.test(src),
        `${lib}.ts still writes to localStorage — the record is the server's`,
      );
    }
  });
});
