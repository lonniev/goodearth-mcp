// Day arithmetic on the season timeline.
//
// Run: node --experimental-strip-types --test src/lib/seasonDays.test.ts
//
// These are the cases that put a mark on the wrong day, and every one of them
// is a wrong reading that looks right: a bar that sits a day off is not
// obviously a bug, it is just a date the grower will act on.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dateAt, dateFor, dayNumber, isDate } from "./seasonDays.ts";

describe("dayNumber", () => {
  it("counts whole days forward", () => {
    assert.equal(dayNumber("2026-01-01", "2026-01-01"), 0);
    assert.equal(dayNumber("2026-01-02", "2026-01-01"), 1);
    assert.equal(dayNumber("2026-02-01", "2026-01-01"), 31);
  });

  it("goes negative before the origin", () => {
    // A task dated last winter belongs on the timeline, to the left of the
    // curve. Clamping it to zero would stack it onto New Year's Day.
    assert.equal(dayNumber("2025-12-25", "2026-01-01"), -7);
  });

  it("crosses a year boundary", () => {
    assert.equal(dayNumber("2027-01-13", "2026-01-01"), 377);
  });

  it("counts the leap day", () => {
    // 2028 is a leap year: Jan 1 to Mar 1 is 60 days, not 59.
    assert.equal(dayNumber("2028-03-01", "2028-01-01"), 60);
    assert.equal(dayNumber("2026-03-01", "2026-01-01"), 59);
  });

  it("survives a daylight-saving boundary", () => {
    // US DST begins 2026-03-08. Parsed at midnight local, adding days here
    // lands at 23:00 the evening before and rounds to the wrong day.
    assert.equal(dayNumber("2026-03-09", "2026-03-07"), 2);
    assert.equal(dayNumber("2026-11-02", "2026-10-31"), 2);
  });

  it("refuses what is not a date", () => {
    assert.equal(dayNumber("last May", "2026-01-01"), null);
    assert.equal(dayNumber("2026-01-01", "whenever"), null);
  });
});

describe("dateFor", () => {
  it("is the inverse of dayNumber", () => {
    const origin = "2026-01-01";
    for (const iso of ["2026-01-01", "2026-06-15", "2027-01-13", "2025-12-25", "2028-02-29"]) {
      const d = dayNumber(iso, origin);
      assert.notEqual(d, null, iso);
      assert.equal(dateFor(d as number, origin), iso, `round trip ${iso}`);
    }
  });

  it("rounds a fractional day for display only", () => {
    // A computed crossing lands between samples. The fraction is real for
    // positioning; the label is a day.
    assert.equal(dateAt(3.4, "2026-05-01"), "2026-05-04");
    assert.equal(dateAt(3.6, "2026-05-01"), "2026-05-05");
  });
});

describe("isDate", () => {
  it("accepts an ISO date and a timestamp", () => {
    assert.equal(isDate("2026-05-01"), true);
    assert.equal(isDate("2026-05-01T09:30:00Z"), true);
  });
  it("rejects everything else", () => {
    for (const bad of [null, undefined, "", "soon", "2026-13-01"]) {
      assert.equal(isDate(bad as string), false, String(bad));
    }
  });
});
