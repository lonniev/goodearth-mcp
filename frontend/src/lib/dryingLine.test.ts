import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clock, dryingLine } from "./dryingLine.ts";
import type { DryingWindowResult } from "./mcp.ts";

// 2026-09-15 is a Tuesday.
const base = (over: Partial<DryingWindowResult> = {}): DryingWindowResult => ({
  success: true, as_of: "", now: "2026-09-15T07:00",
  today: { date: "2026-09-15", dew_off: { state: "clears", at: "2026-09-15T09:00" } },
  tomorrow: { date: "2026-09-16", dew_off: { state: "clears", at: "2026-09-16T10:00" } },
  dry_run: { start: "2026-09-15", end: "2026-09-17", days: 3, strongest: "2026-09-16" },
  next_rain: { at: "2026-09-18T14:00", mm: 2.1 },
  days: [], note: "", sources: [],
  ...over,
});

describe("the Dashboard's drying line", () => {
  it("reads like the owner's preview", () => {
    assert.equal(dryingLine(base()), "Dry by 9 am · 3 dry days today–Thu · rain Fri");
  });

  it("says dry now once the dew has gone", () => {
    assert.match(dryingLine(base({ now: "2026-09-15T11:00" })), /^Dry now · /);
  });

  it("turns to tomorrow morning after the morning is over", () => {
    assert.match(dryingLine(base({ now: "2026-09-15T16:00" })), /^Dry by 10 am tomorrow · /);
  });

  it("says a wet morning plainly", () => {
    const r = base({ today: { date: "2026-09-15", dew_off: { state: "wet", at: null } } });
    assert.match(dryingLine(r), /^Wet all morning · /);
  });

  it("names tomorrow and today rather than their weekdays", () => {
    const r = base({
      dry_run: { start: "2026-09-16", end: "2026-09-16", days: 1, strongest: null },
      next_rain: { at: "2026-09-15T18:00", mm: 1 },
    });
    assert.equal(dryingLine(r), "Dry by 9 am · dry tomorrow · rain today");
  });

  it("says so when the forecast holds no dry day or no rain", () => {
    assert.match(dryingLine(base({ dry_run: null })), /no dry day in the forecast/);
    assert.match(dryingLine(base({ next_rain: null })), /no rain in the forecast$/);
  });

  it("reads the clock the way people say it", () => {
    assert.deepEqual(["00", "09", "12", "13"].map(clock), ["12 am", "9 am", "12 pm", "1 pm"]);
  });
});
