// Run: node --experimental-strip-types --test src/lib/wildlifeFilter.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOn, matches, NO_WILDLIFE_FILTER, summarise, type WildlifeFilter } from "./wildlifeFilter.ts";
import type { WildlifeRow } from "./mcp.ts";
import type { SavedWildlife } from "./wildlifeModels.ts";

const TODAY = new Date("2026-09-22T12:00:00");
const on = (o: Partial<WildlifeFilter>): WildlifeFilter => ({ ...NO_WILDLIFE_FILTER, ...o });

const watch = (over: Partial<SavedWildlife> = {}): SavedWildlife => ({
  id: "wl-1", regionId: "b1", species: "Eastern bluebird", event: "first egg",
  driver: "heat", ...over,
} as SavedWildlife);

const roster = () => watch({ id: "wl-2", species: "Barred owl", driver: undefined });

const row = (over: Record<string, unknown> = {}): WildlifeRow => ({
  species: "Eastern bluebird", event: "first egg", emoji: null, note: null,
  driver: "heat", threshold: "", reached_on: null, projected_date: "2026-09-30",
  ...over,
} as WildlifeRow);

describe("whether anything is narrowing the year", () => {
  it("is off when nothing is set, and off for a half-typed number", () => {
    assert.equal(isOn(NO_WILDLIFE_FILTER), false);
    assert.equal(isOn(on({ dueDays: " " })), false);
    assert.equal(isOn(on({ dueDays: "soon" })), false);
  });

  it("is on for zero, which is a real answer", () => {
    assert.equal(isOn(on({ dueDays: "0" })), true);
  });
});

describe("due within n days", () => {
  it("keeps an event inside the window and drops one beyond it", () => {
    assert.equal(matches(watch(), row(), on({ dueDays: "10" }), TODAY), true);
    assert.equal(matches(watch(), row({ projected_date: "2026-11-01" }),
      on({ dueDays: "10" }), TODAY), false);
  });

  it("prefers the server's own days_away when it gives one", () => {
    assert.equal(matches(watch(), row({ days_away: 3, projected_date: null }),
      on({ dueDays: "5" }), TODAY), true);
  });

  it("reads an interval event from the day its window opens", () => {
    // Gestation varies, so these report a window. The day it OPENS is the one
    // a grower is waiting for.
    assert.equal(matches(watch({ driver: "interval" }),
      row({ projected_date: null, window: { from: "2026-09-25", to: "2026-10-05" } }),
      on({ dueDays: "7" }), TODAY), true);
  });

  it("drops what has already arrived — that is not DUE", () => {
    assert.equal(matches(watch(), row({ reached_on: "2026-09-01" }),
      on({ dueDays: "30" }), TODAY), false);
  });

  it("drops a roster entry, which has no clock at all", () => {
    assert.equal(matches(roster(), undefined, on({ dueDays: "30" }), TODAY), false);
  });
});

describe("already happened", () => {
  it("keeps what arrived and drops what has not", () => {
    assert.equal(matches(watch(), row({ reached_on: "2026-05-04" }), on({ happened: true }), TODAY), true);
    assert.equal(matches(watch(), row(), on({ happened: true }), TODAY), false);
  });
});

describe("on the roster, no date", () => {
  it("keeps a creature named with no event, and drops a dated one", () => {
    assert.equal(matches(roster(), undefined, on({ rosterOnly: true }), TODAY), true);
    assert.equal(matches(watch(), row(), on({ rosterOnly: true }), TODAY), false);
  });
});

describe("saying what is on", () => {
  it("is a few words, or nothing at all", () => {
    assert.equal(summarise(NO_WILDLIFE_FILTER), "");
    assert.equal(summarise(on({ dueDays: "14", rosterOnly: true })), "due ≤ 14d · roster");
  });
});

describe("the three pages now read alike", () => {
  const view = (n: string) => readFileSync(new URL(`../views/${n}.tsx`, import.meta.url), "utf8");

  it("each heading carries its own reading time, once", () => {
    for (const [n, h] of [["Crops", "Plant ledger"], ["Pests", "What you're watching"],
                          ["Wildlife", "The year"]] as const) {
      assert.match(view(n), new RegExp(`${h.replace(/[^\w\s]/g, ".")}\\$\\{ranAt`), n);
      assert.match(view(n), /hideTime/, n);
    }
  });

  it("each widens its read while a filter is on", () => {
    for (const n of ["Crops", "Pests", "Wildlife"]) {
      assert.match(view(n), /pageSize: narrowed \? 200 : 20/, n);
    }
  });

  it("none of them says what its list already shows", () => {
    for (const n of ["Pests", "Wildlife"]) {
      assert.doesNotMatch(view(n), /data\?\.summary && <p/, n);
    }
  });

  it("all three use the one filter control", () => {
    for (const n of ["Crops", "Pests", "Wildlife"]) {
      assert.match(view(n), /<TableFilter/, n);
    }
  });
});
