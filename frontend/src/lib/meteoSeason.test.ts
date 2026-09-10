// Run: node --experimental-strip-types --test src/lib/meteoSeason.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seasonBounds } from "./meteoSeason.ts";

describe("the meteorological season a date sits in", () => {
  it("names the quarter, on whole calendar months", () => {
    assert.deepEqual(seasonBounds("2026-09-10"),
      { name: "Fall", start: "2026-09-01", end: "2026-11-30" });
    assert.deepEqual(seasonBounds("2026-03-01"),
      { name: "Spring", start: "2026-03-01", end: "2026-05-31" });
    assert.deepEqual(seasonBounds("2026-07-04"),
      { name: "Summer", start: "2026-06-01", end: "2026-08-31" });
  });

  it("carries December forward and January back", () => {
    // The whole reason this is computed rather than looked up. A table keyed
    // on the month alone gets the name right and the YEAR wrong, and the
    // window lands twelve months from where the reader is standing.
    assert.deepEqual(seasonBounds("2026-12-15"),
      { name: "Winter", start: "2026-12-01", end: "2027-02-28" });
    assert.deepEqual(seasonBounds("2027-01-15"),
      { name: "Winter", start: "2026-12-01", end: "2027-02-28" });
    assert.deepEqual(seasonBounds("2026-02-15"),
      { name: "Winter", start: "2025-12-01", end: "2026-02-28" });
  });

  it("ends winter on the 29th in a leap year", () => {
    assert.equal(seasonBounds("2028-01-05")?.end, "2028-02-29");
    assert.equal(seasonBounds("2100-01-05")?.end, "2100-02-28");  // not a leap year
  });

  it("every boundary is covered, and no date falls between two seasons", () => {
    // Walks a whole year rather than checking the four corners somebody chose.
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 15, 28]) {
        const day = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const b = seasonBounds(day);
        assert.ok(b, `${day} has no season`);
        assert.ok(b.start <= day && day <= b.end,
          `${day} is not inside its own season ${b.start}..${b.end}`);
      }
    }
  });

  it("refuses what is not a date rather than guessing one", () => {
    assert.equal(seasonBounds(""), null);
    assert.equal(seasonBounds("someday"), null);
    assert.equal(seasonBounds("2026-13-01"), null);
  });
});
