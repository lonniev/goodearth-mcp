// The date axis must say more as you look closer, not less.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dateTicks, unitFor } from "./dateTicks.ts";

/// A year of dates from 2026-01-01, indexed by day number.
const isoAt = (d: number): string | null => {
  if (d < 0 || d > 400) return null;
  const t = Date.UTC(2026, 0, 1) + d * 86400000;
  return new Date(t).toISOString().slice(0, 10);
};

describe("unitFor — the window decides the division", () => {
  it("divides a season by months", () => assert.equal(unitFor(240), "month"));
  it("divides a couple of months by weeks", () => assert.equal(unitFor(45), "week"));
  it("divides a fortnight by days", () => assert.equal(unitFor(14), "day"));
  it("divides a single week by days", () => assert.equal(unitFor(6), "day"));
});

describe("dateTicks — zooming in shows MORE", () => {
  it("labels a six-week window with more than the two months it spans", () => {
    // The reported bug: a zoomed Dew point chart showed MAY and JUN, and
    // nothing between them.
    const wide = dateTicks(120, 160, isoAt);
    assert.ok(wide.length > 2, `six weeks got ${wide.length} labels`);
  });

  it("gives a narrower window at least as many divisions as a wider one", () => {
    const season = dateTicks(0, 240, isoAt).length;
    const weeks = dateTicks(120, 160, isoAt).length;
    const days = dateTicks(120, 130, isoAt).length;
    assert.ok(weeks >= season - 2, "weeks should not be sparser than months");
    assert.ok(days >= 4, `ten days got ${days} labels`);
  });

  it("never prints so many labels that they collide", () => {
    for (const [lo, hi] of [[0, 400], [0, 240], [100, 160], [100, 130], [100, 110], [100, 104]]) {
      const n = dateTicks(lo, hi, isoAt).length;
      assert.ok(n <= 20, `${hi - lo} days produced ${n} labels`);
    }
  });
});

describe("dateTicks — what each level says", () => {
  it("names months across a season", () => {
    const t = dateTicks(0, 240, isoAt);
    assert.ok(t.every((x) => /^[A-Z]{3}( \d{4})?$/.test(x.label)), JSON.stringify(t.slice(0, 4)));
  });

  it("marks January with its year, because a timeline can span seasons", () => {
    const jan = dateTicks(0, 240, isoAt)[0];
    assert.match(jan.label, /JAN 2026/);
    assert.equal(jan.major, true);
  });

  it("lands week ticks on Mondays", () => {
    for (const t of dateTicks(120, 160, isoAt)) {
      if (t.major) continue;             // the 1st of a month, wherever it falls
      const iso = isoAt(t.d)!;
      assert.equal(new Date(iso + "T12:00:00Z").getUTCDay(), 1, `${iso} is not a Monday`);
    }
  });

  it("names weekdays when the window is a fortnight", () => {
    const t = dateTicks(120, 130, isoAt).filter((x) => !x.major);
    assert.ok(t.length > 0);
    assert.ok(t.every((x) => /^[A-Z][a-z]{2} \d{1,2}$/.test(x.label)), JSON.stringify(t));
  });

  it("keeps the month boundary visible while showing days inside it", () => {
    // Late January into February — the coarse structure must survive the detail.
    const t = dateTicks(26, 36, isoAt);
    assert.ok(t.some((x) => x.major), "no month boundary marked");
  });
});

describe("dateTicks — the edges", () => {
  it("skips days the domain cannot name rather than inventing them", () => {
    const t = dateTicks(390, 420, isoAt);
    assert.ok(t.every((x) => isoAt(x.d) !== null));
  });

  it("answers for a window of nothing", () => {
    assert.doesNotThrow(() => dateTicks(5, 5, isoAt));
  });

  it("reads dates at noon, so a label never slips to the day before", () => {
    // A date parsed at midnight lands on the previous day west of Greenwich.
    const t = dateTicks(120, 130, isoAt).filter((x) => !x.major);
    for (const x of t) {
      const iso = isoAt(x.d)!;
      const dayNum = Number(iso.slice(8, 10));
      assert.ok(x.label.endsWith(String(dayNum)), `${x.label} is not ${iso}`);
    }
  });
});
