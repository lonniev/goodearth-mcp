// Run: node --experimental-strip-types --test src/lib/ledgerFilter.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apply, isOn, matches, NO_FILTER, summarise, type LedgerFilter } from "./ledgerFilter.ts";
import type { LedgerRow } from "../components/CropLedger.ts";

const TODAY = new Date("2026-09-22T12:00:00");
const none = () => false;
const all = () => true;

const row = (over: Record<string, unknown> = {}): LedgerRow => ({
  planting: { id: "pl-1", crop: "Zinnia", setOut: "2026-06-01", regionId: "b1" },
  status: {
    crop: "Zinnia", set_out: "2026-06-01", gdd_target: 1200,
    gdd_remaining: 200, projected_date: "2026-09-30", state: "on_pace",
    note: "", finish: { verdict: "finishes", note: "" },
    ...over,
  },
} as unknown as LedgerRow);

const on = (over: Partial<LedgerFilter>): LedgerFilter => ({ ...NO_FILTER, ...over });

describe("whether anything is narrowing the list", () => {
  it("is off when nothing is set", () => {
    assert.equal(isOn(NO_FILTER), false);
  });

  it("is off for a number half typed", () => {
    // Hiding rows on the strength of "1" while someone reaches for the "4" is
    // how a list appears to lose things.
    assert.equal(isOn(on({ withinDays: "" })), false);
    assert.equal(isOn(on({ withinDays: "  " })), false);
    assert.equal(isOn(on({ gddUnder: "banana" })), false);
    assert.equal(isOn(on({ gddUnder: "-4" })), false);
  });

  it("is on for zero, which is a real answer", () => {
    assert.equal(isOn(on({ gddUnder: "0" })), true);
  });
});

describe("ready before frost", () => {
  it("keeps what finishes and what already has", () => {
    assert.equal(matches(row({ finish: { verdict: "finishes", note: "" } }),
      on({ readyBeforeFrost: true }), none, TODAY), true);
    assert.equal(matches(row({ finish: { verdict: "finished", note: "" } }),
      on({ readyBeforeFrost: true }), none, TODAY), true);
  });

  it("drops what will not", () => {
    assert.equal(matches(row({ finish: { verdict: "wont_finish", note: "" } }),
      on({ readyBeforeFrost: true }), none, TODAY), false);
  });

  it("drops a row nobody could evaluate", () => {
    // A perennial, or a row with no set-out. It is not "no" to this question,
    // it is "not asked" — and a filter that kept it would be answering for it.
    assert.equal(matches({ planting: row().planting } as LedgerRow,
      on({ readyBeforeFrost: true }), none, TODAY), false);
  });
});

describe("projected within n days", () => {
  it("keeps a date inside the window and drops one beyond it", () => {
    const r = row({ projected_date: "2026-09-30" });          // 8 days out
    assert.equal(matches(r, on({ withinDays: "10" }), none, TODAY), true);
    assert.equal(matches(r, on({ withinDays: "5" }), none, TODAY), false);
  });

  it("keeps a planting already past its target", () => {
    // The heat arrived, which is the thing being asked about.
    const r = row({ state: "past_target", projected_date: "2026-08-01" });
    assert.equal(matches(r, on({ withinDays: "3" }), none, TODAY), true);
  });

  it("drops a date in the past that is not past target", () => {
    const r = row({ projected_date: "2026-08-01", state: "stalled" });
    assert.equal(matches(r, on({ withinDays: "30" }), none, TODAY), false);
  });

  it("drops a row with no projection at all", () => {
    assert.equal(matches(row({ projected_date: null }),
      on({ withinDays: "30" }), none, TODAY), false);
  });
});

describe("heat remaining under n", () => {
  it("keeps at the boundary and drops above it", () => {
    assert.equal(matches(row({ gdd_remaining: 200 }), on({ gddUnder: "200" }), none, TODAY), true);
    assert.equal(matches(row({ gdd_remaining: 201 }), on({ gddUnder: "200" }), none, TODAY), false);
  });

  it("drops a row with nothing computed", () => {
    assert.equal(matches(row({ gdd_remaining: undefined }),
      on({ gddUnder: "500" }), none, TODAY), false);
  });
});

describe("has seed", () => {
  it("asks the page, which is the only thing holding the packets", () => {
    assert.equal(matches(row(), on({ hasSeed: true }), all, TODAY), true);
    assert.equal(matches(row(), on({ hasSeed: true }), none, TODAY), false);
  });
});

describe("applying it", () => {
  it("hands back every row when nothing is on", () => {
    const rows = [row(), row({ finish: { verdict: "wont_finish", note: "" } })];
    assert.equal(apply(rows, NO_FILTER, none, TODAY).length, 2);
  });

  it("narrows to what answers every question at once", () => {
    const rows = [
      row({ gdd_remaining: 100 }),
      row({ gdd_remaining: 900 }),
      row({ gdd_remaining: 50, finish: { verdict: "wont_finish", note: "" } }),
    ];
    const out = apply(rows, on({ readyBeforeFrost: true, gddUnder: "200" }), none, TODAY);
    assert.equal(out.length, 1);
    assert.equal(out[0].status?.gdd_remaining, 100);
  });
});

describe("saying what is on", () => {
  it("is a few words, or nothing at all", () => {
    assert.equal(summarise(NO_FILTER), "");
    assert.equal(summarise(on({ hasSeed: true, gddUnder: "300" })), "has seed · ≤ 300 GDD");
  });
});

describe("what the page does with it", () => {
  const view = () =>
    readFileSync(new URL("../views/Crops.tsx", import.meta.url), "utf8");

  it("reads the whole block while a filter is on, not a page of it", () => {
    // Filtering twenty rows while the pager counted the block would answer
    // "among the first twenty" — a lie with a number on it.
    assert.match(view(), /pageSize: narrowed \? 200 : 20/);
    assert.match(view(), /page: narrowed \? 0 : pageNo/);
  });

  it("stands the pager down rather than counting past the list it shows", () => {
    assert.match(view(), /narrowed \? \([\s\S]{0,400}\{shown\.length\} of \{plantings\.length\}/);
  });

  it("asks the same seed question the plant's own row asks", () => {
    // "Has seed" here and the green mark there must never disagree.
    assert.match(view(), /applyFilter\(ledgerRows, filter,\s*\n?\s*\(r\) => lotsFor\(/);
  });

  it("says nothing about frost above the table any more", () => {
    assert.doesNotMatch(view(), /Median first frost/);
    assert.doesNotMatch(view(), /will not make it/);
  });

  it("puts the reading time in the heading, once", () => {
    assert.match(view(), /Plant ledger\$\{ranAt/);
    assert.match(view(), /<Provenance tool="goodearth_crop_gdd_status"[\s\S]{0,120}hideTime/);
  });
});
