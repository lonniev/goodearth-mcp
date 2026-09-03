// Day arithmetic on the season timeline.
//
// Run: node --experimental-strip-types --test src/lib/seasonDays.test.ts
//
// These are the cases that put a mark on the wrong day, and every one of them
// is a wrong reading that looks right: a bar that sits a day off is not
// obviously a bug, it is just a date the grower will act on.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dateAt, dateFor, dayNumber, isDate, timelineDomain } from "./seasonDays.ts";

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

describe("timelineDomain", () => {
  it("does NOT grow when everything fits on the curve", () => {
    // The property that matters most. Growing the domain rescales every zoom
    // fraction with it, so it must never happen by accident — an ordinary
    // season has to behave exactly as it always did.
    const d = timelineDomain(240, [0, 12.5, 239]);
    assert.deepEqual(d, { lo: 0, hi: 240, extended: false });
  });

  it("reaches forward for a task dated past the curve", () => {
    // "Buy seeds Jan 13 2027" against a season starting Jan 1 2026: day 377.
    const d = timelineDomain(240, [12, 377]);
    assert.equal(d.extended, true);
    assert.ok(d.hi >= 377, "the day must be inside the domain");
    assert.equal(d.lo, 0, "no reason to reach backward");
  });

  it("reaches back for a mark before the season began", () => {
    const d = timelineDomain(240, [-30, 100]);
    assert.equal(d.extended, true);
    assert.ok(d.lo <= -30);
  });

  it("pads so an edge mark is not clipped in half", () => {
    const d = timelineDomain(240, [377]);
    assert.ok(d.hi > 377, "a mark exactly on the edge would be half-drawn");
  });

  it("ignores marks it cannot place", () => {
    assert.deepEqual(
      timelineDomain(240, [null, undefined, NaN, Infinity, 50]),
      { lo: 0, hi: 240, extended: false },
    );
  });

  it("survives having no marks at all", () => {
    assert.deepEqual(timelineDomain(240, []), { lo: 0, hi: 240, extended: false });
  });
});

describe("the span buttons against a lengthened domain", () => {
  it("a week is still seven days once the timeline reaches next year", () => {
    // showSpan turns days into a FRACTION of the total it is handed, and the
    // chart then maps that fraction back over the domain. Hand it the array
    // length while the domain is longer and every button lies by the ratio
    // between them — "Week" quietly showing a fortnight is a wrong reading
    // that looks right, on a chart a grower plans from.
    const { lo, hi } = timelineDomain(240, [377]);
    const domainSpan = hi - lo + 1;
    const frac = 7 / domainSpan;                 // what showSpan computes
    const shownDays = frac * (hi - lo);          // what windowToDomain gives back
    assert.ok(Math.abs(shownDays - 7) < 0.1, `week showed ${shownDays.toFixed(2)} days`);
  });

  it("would show the WRONG span if handed the array length instead", () => {
    // The bug this guards, stated as a failing arithmetic rather than a hope.
    const { lo, hi } = timelineDomain(240, [377]);
    const wrongFrac = 7 / 241;                   // the array length
    const shownDays = wrongFrac * (hi - lo);
    assert.ok(shownDays > 10, "the mistake must be big enough to matter");
  });
});

describe("the chart's own wiring", () => {
  it("never hands showSpan the raw array length", () => {
    // A source guard, because this is the mistake that produces a wrong
    // reading rather than a crash: the arithmetic above proves `totalDays`
    // would show 10+ days for a "Week" button once the timeline lengthens,
    // and nothing about the screen would look broken.
    const src = readFileSync(new URL("../components/SeasonChart.tsx", import.meta.url), "utf8");
    for (const call of src.match(/showSpan\([^)]*\)/g) ?? []) {
      assert.ok(
        !/\btotalDays\b/.test(call),
        `${call} passes the array length; it must pass the domain span in days`,
      );
    }
  });
});
