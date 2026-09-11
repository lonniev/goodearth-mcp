// Run: node --experimental-strip-types --test src/lib/diseaseRows.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { began, heading, order, rowDate, toneOf } from "./diseaseRows.ts";
import type { DiseaseRiskResult, DiseaseVerdict } from "./mcp.ts";

function model(over: Partial<DiseaseVerdict> = {}): DiseaseVerdict {
  return {
    model: "botrytis", disease: "grey mould",
    about: { name: "botrytis wetness", disease: "grey mould", crops: ["calendula"],
             citation: "the literature", asks: "unbroken wet hours" },
    risk: "conditions not met", at_risk: false, recent: false, recent_window_days: 14,
    season_count: 0, last_period: null, next_period: null,
    now: "", explain: "",
    ...over,
  };
}

const card = (diseases: DiseaseVerdict[]): DiseaseRiskResult =>
  ({ diseases } as unknown as DiseaseRiskResult);

describe("which date a row shows", () => {
  it("prefers what is coming over what has been", () => {
    const v = model({ next_period: { from: "2026-09-17" }, last_period: { from: "2026-06-14" } });
    assert.deepEqual(rowDate(v), { lead: "from", date: "2026-09-17" });
  });

  it("falls back to the last one when nothing is coming", () => {
    const v = model({ last_period: { from: "2026-06-14" } });
    assert.deepEqual(rowDate(v), { lead: "last", date: "2026-06-14" });
  });

  it("says nothing rather than an empty date when a season found none", () => {
    assert.equal(rowDate(model()), null);
  });

  it("reads an HOUR as happily as a DATE", () => {
    // Hutton's periods begin on a date and botrytis's on an hour. Reading only
    // `from` left half the models with no date on the row at all.
    assert.equal(began({ from: "2026-09-17" }), "2026-09-17");
    assert.equal(began({ start: "2026-09-13T04:00" }), "2026-09-13T04:00");
    assert.equal(began(null), "");
  });
});

describe("what a row's chip says", () => {
  it("is the forecast when something is coming", () => {
    assert.equal(toneOf(model({ next_period: { from: "2026-09-17" }, at_risk: true })), "ahead");
  });

  it("is recent when one happened lately", () => {
    assert.equal(toneOf(model({ recent: true, at_risk: true, last_period: { from: "2026-09-01" } })), "recent");
  });

  it("is quiet when a period is old, however many the season had", () => {
    // The distinction the whole feature turned on. Six periods since June is
    // not an answer about today.
    const v = model({ season_count: 6, last_period: { from: "2026-06-14" } });
    assert.equal(toneOf(v), "quiet");
  });

  it("prefers the forecast over recency when both are true", () => {
    const v = model({ next_period: { from: "2026-09-17" }, recent: true, at_risk: true });
    assert.equal(toneOf(v), "ahead");
  });
});

describe("the order of the card", () => {
  it("puts what is happening above what is not", () => {
    const live = model({ model: "hutton", at_risk: true, next_period: { from: "2026-09-17" } });
    const { live: a, quiet: b } = order(card([model(), live, model({ model: "mills" })]));
    assert.deepEqual(a.map((v) => v.model), ["hutton"]);
    assert.equal(b.length, 2);
  });

  it("keeps the quiet ones rather than hiding them", () => {
    // "Nothing found" and "did not look" must not render the same.
    const { live, quiet } = order(card([model(), model({ model: "mills" })]));
    assert.equal(live.length, 0);
    assert.equal(quiet.length, 2);
  });
});

describe("the heading", () => {
  it("counts only what is happening now", () => {
    const at = model({ at_risk: true });
    assert.equal(heading(card([at, model(), model()])), "1 of 3 models reporting risk");
  });

  it("says so plainly when nothing is", () => {
    assert.equal(heading(card([model(), model()])), "Nothing reporting risk");
  });

  it("does not count a busy season as a busy today", () => {
    const busy = model({ season_count: 20, last_period: { from: "2026-06-14" } });
    assert.equal(heading(card([busy])), "Nothing reporting risk");
  });
});
