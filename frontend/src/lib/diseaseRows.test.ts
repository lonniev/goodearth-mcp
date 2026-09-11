// Run: node --experimental-strip-types --test src/lib/diseaseRows.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { asideLine, began, cropWatch, heading, order, rowDate, toneOf } from "./diseaseRows.ts";
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

  it("reads an HOUR as happily as a DATE, and hands back a DATE", () => {
    // Hutton's periods begin on a date and botrytis's on an hour. Reading only
    // `from` left half the models with no date on the row at all.
    assert.equal(began({ from: "2026-09-17" }), "2026-09-17");
    assert.equal(began({ start: "2026-09-13T04:00" }), "2026-09-13");
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

describe("only the models this ground grows for", () => {
  const withCrops = (name: string, crops: string[], over = {}) =>
    ({ ...model({ model: name, ...over }),
       about: { name, disease: name, crops, citation: "", asks: "" } }) as DiseaseVerdict;

  const FIVE = [
    withCrops("hutton", ["potato", "tomato"], { at_risk: true, next_period: { from: "2026-09-17" } }),
    withCrops("mills", ["apple", "crabapple"], { at_risk: true, next_period: { from: "2026-09-13" } }),
    withCrops("botrytis", ["calendula", "cut flowers"], { at_risk: true, next_period: { from: "2026-09-13" } }),
  ];

  it("sets aside a model no planting claims", () => {
    // Apple scab on a flower farm was SHOWN, with a caption apologising for
    // it. Matching the model's own list against the record is the fix.
    const { live, unclaimed } = order(card(FIVE), ["Calendula officinalis", "Potato"]);
    assert.deepEqual(live.map((v) => v.model), ["hutton", "botrytis"]);
    assert.deepEqual(unclaimed.map((v) => v.model), ["mills"]);
  });

  it("counts the heading against what is SHOWN, not against all five", () => {
    assert.equal(heading(card(FIVE), ["Calendula officinalis", "Potato"]),
      "2 of 2 models reporting risk");
  });

  it("shows every model when the record names no crop at all", () => {
    // An empty record is not a statement that the ground grows everything, and
    // it is not one that it grows nothing either. Showing all of them is the
    // answer that hides nothing.
    const { live, unclaimed } = order(card(FIVE), []);
    assert.equal(live.length, 3);
    assert.equal(unclaimed.length, 0);
  });

  it("accounts out loud for what it set aside", () => {
    const { unclaimed } = order(card(FIVE), ["Calendula officinalis"]);
    const line = asideLine(unclaimed);
    assert.match(line, /2 models set aside/);
    assert.match(line, /does not grow/);
  });

  it("says nothing when nothing was set aside", () => {
    assert.equal(asideLine([]), "");
  });
});

describe("what a crop row says about disease", () => {
  const withCrops = (name: string, crops: string[], over = {}) =>
    ({ ...model({ model: name, disease: name, ...over }),
       about: { name, disease: name, crops, citation: "", asks: "" } }) as DiseaseVerdict;

  const DATA = card([
    withCrops("hutton", ["potato", "tomato"],
      { at_risk: true, next_period: { from: "2026-09-17" } }),
    withCrops("botrytis", ["calendula", "cut flowers"],
      { at_risk: true, next_period: { from: "2026-09-13" } }),
    withCrops("mills", ["apple"], { at_risk: true, next_period: { from: "2026-09-13" } }),
    withCrops("wallin", ["potato", "tomato"],
      { at_risk: false, last_period: { from: "2026-06-14" } }),
  ]);

  it("names only the models that claim this crop", () => {
    assert.deepEqual(cropWatch(DATA, "Calendula officinalis").map((w) => w.model), ["botrytis"]);
    assert.deepEqual(cropWatch(DATA, "Potato").map((w) => w.model), ["hutton"]);
  });

  it("says nothing for a crop no model claims", () => {
    assert.deepEqual(cropWatch(DATA, "Garlic"), []);
  });

  it("leaves the QUIET models out of a working list", () => {
    // Wallin claims potato but is not reporting risk. A ledger row saying
    // "nothing, all season" beside every planting is a column of noise; the
    // card is where absence gets reported.
    assert.equal(cropWatch(DATA, "Potato").some((w) => w.model === "wallin"), false);
  });

  it("puts the soonest first", () => {
    const both = cropWatch(DATA, "Tomato");
    assert.deepEqual(both.map((w) => w.date), [...both.map((w) => w.date)].sort());
  });

  it("carries whether the date is a forecast or a thing that happened", () => {
    assert.equal(cropWatch(DATA, "Potato")[0].forecast, true);
    assert.equal(cropWatch(DATA, "Potato")[0].lead, "from");
  });

  it("is empty rather than throwing when nothing has been read yet", () => {
    assert.deepEqual(cropWatch(null, "Potato"), []);
    assert.deepEqual(cropWatch(DATA, ""), []);
  });
});

describe("the date a row hands on", () => {
  it("is always a plain date, never a timestamp", () => {
    // Botrytis periods begin on an HOUR. Every consumer that formatted the
    // result assumed a date, and the crop ledger's `new Date(iso + "T12:00")`
    // turned "2026-09-13T04:00" into the literal words "Invalid Date" beside
    // a grower's calendula. Slicing here means no consumer has to remember.
    assert.equal(began({ start: "2026-09-13T04:00" }), "2026-09-13");
    assert.equal(began({ from: "2026-09-17" }), "2026-09-17");
  });

  it("hands a plain date on through rowDate too", () => {
    const v = model({ next_period: { start: "2026-09-13T04:00", end: "2026-09-14T09:00" } });
    assert.deepEqual(rowDate(v), { lead: "from", date: "2026-09-13" });
  });

  it("survives being parsed the way the ledger parses it", () => {
    const got = new Date(began({ start: "2026-09-13T04:00" }) + "T12:00:00");
    assert.equal(Number.isNaN(got.getTime()), false, "the ledger would print Invalid Date");
  });
});
