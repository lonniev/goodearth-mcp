import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WaterBalanceResult } from "./mcp.ts";
import { percent, waterLine } from "./waterLine.ts";

const base = (over: Partial<WaterBalanceResult> = {}): WaterBalanceResult => ({
  success: true, as_of: "", days: [], note: "", sources: [],
  today: {
    date: "2026-11-06", since: "2026-10-23", balance_mm: -29.5, rain_mm: 1.1, et0_mm: 30.6,
    topsoil: 0.152, root_zone: 0.215, root_zone_week_change: -0.009,
  },
  ahead: { until: "2026-11-12", rain_mm: 8.6, et0_mm: 5.6, balance_change_mm: 3.0 },
  ...over,
});

describe("the Dashboard's water line", () => {
  it("leads with the balance, then why, then the week ahead", () => {
    assert.equal(waterLine(base(), "C"),
      "29.5 mm short over 15 days · 1.1 mm rain, 30.6 mm to the air · +3.0 mm in the week ahead");
  });

  it("speaks inches to a Fahrenheit reader", () => {
    assert.match(waterLine(base(), "F"), /^1\.16 in short over 15 days · 0\.04 in rain, 1\.20 in to the air/);
  });

  it("says to spare when the sky gave more", () => {
    const r = base();
    r.today = { ...r.today, balance_mm: 12 };
    assert.match(waterLine(r, "C"), /^12\.0 mm to spare/);
  });

  it("says even, not 0.0 mm short", () => {
    const r = base();
    r.today = { ...r.today, balance_mm: 0.2 };
    assert.match(waterLine(r, "C"), /^Even over 15 days/);
  });

  it("drops the week ahead when there is no forecast", () => {
    assert.doesNotMatch(waterLine(base({ ahead: { until: "2026-11-06", rain_mm: 0, et0_mm: 0, balance_change_mm: 0 } }), "C"), /week ahead/);
  });
});

describe("soil moisture as a percentage", () => {
  it("rounds volumetric water", () => {
    assert.equal(percent(0.215), "22%");
    assert.equal(percent(null), "—");
  });
});
