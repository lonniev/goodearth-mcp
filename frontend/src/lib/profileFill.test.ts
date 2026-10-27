// Run: node --experimental-strip-types --test src/lib/profileFill.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bloomSpan, fillFrom, mayFill, provenance } from "./profileFill.ts";
import type { PlantProfileResult } from "./mcp.ts";

const F = { degreeDays: (d: number) => d, temp: (f: number) => f };
const C = { degreeDays: (d: number) => (d * 5) / 9, temp: (f: number) => ((f - 32) * 5) / 9 };

const pumpkin: PlantProfileResult = {
  success: true,
  profile: {
    scientific_name: "Cucurbita pepo", common_name: "Pumpkin", family: "Cucurbitaceae", kind: "annual",
    days_to_maturity: { typical: 100, low: 90, high: 120, counted_from: "sowing" },
    published_gdd: null, base_temp_f: 50, height_in: { typical: 18.4, low: 12, high: 24 },
    flower_color: "yellow", bloom_months: [7, 8], frost_hardy: false,
    chill_hours: null, hardy_to_f: null,
    sources: [{ title: "UMN Extension", url: "https://extension.umn.edu/x" }], notes: "",
  },
  on_this_plot: { gdd_target: 1840, base_temp_f: 50, basis: "days_to_maturity", bloom_months: [7, 8],
                  days: 100, counted_from: "typical_last_frost", record: "2016–2025" },
};

describe("what a pick fills", () => {
  it("fills every field the profile answers, in the form's own names", () => {
    assert.deepEqual(fillFrom(pumpkin, F), {
      target: "1840", base: "50", color: "yellow", height: "18", bloom_from: "7", bloom_to: "8",
    });
  });

  it("speaks the grower's scale", () => {
    const got = fillFrom(pumpkin, C);
    assert.equal(got.target, "1022");
    assert.equal(got.base, "10");
  });

  it("ticks frost tolerance only when the plant has it", () => {
    const hardy = { ...pumpkin, profile: { ...pumpkin.profile!, frost_hardy: true } };
    assert.equal(fillFrom(hardy, F).hardy, "true");
    assert.equal(fillFrom(pumpkin, F).hardy, undefined);
  });

  it("leaves heat and base alone when no source gave a target", () => {
    const tree = { ...pumpkin, on_this_plot: { ...pumpkin.on_this_plot!, gdd_target: null, basis: null } };
    const got = fillFrom(tree, F);
    assert.equal(got.target, undefined);
    assert.equal(got.base, undefined);
  });

  it("refuses a colour the form has no option for", () => {
    const odd = { ...pumpkin, profile: { ...pumpkin.profile!, flower_color: "plaid" } };
    assert.equal(fillFrom(odd, F).color, undefined);
  });

  it("is nothing for a failed lookup", () => assert.deepEqual(fillFrom({ success: false }, F), {}));
});

describe("a bloom season", () => {
  it("runs from its first month to its last", () => assert.deepEqual(bloomSpan([7, 8, 6]), [6, 8]));
  it("wraps the year's end", () => assert.deepEqual(bloomSpan([1, 2, 12]), [12, 2]));
  it("is one month when it is one month", () => assert.deepEqual(bloomSpan([5]), [5, 5]));
  it("is nothing without months", () => {
    assert.equal(bloomSpan(null), null);
    assert.equal(bloomSpan([0, 13]), null);
  });
});

describe("never overwriting the grower", () => {
  it("fills an empty field", () => assert.equal(mayFill("", undefined), true));
  it("refreshes what it wrote itself", () => assert.equal(mayFill("1840", "1840"), true));
  it("keeps what the grower entered", () => {
    assert.equal(mayFill("900", undefined), false);
    assert.equal(mayFill("900", "1840"), false);
  });
});

describe("where it came from", () => {
  it("names the plant, the days, the record and the sources", () => {
    const why = provenance(pumpkin);
    for (const part of ["Pumpkin", "100 days (90–120)", "2016–2025", "UMN Extension"]) {
      assert.ok(why.includes(part), part);
    }
  });
});
