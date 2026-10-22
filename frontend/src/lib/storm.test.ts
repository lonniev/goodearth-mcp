import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stormWhen, stormWords } from "./storm.ts";
import type { StormSignal } from "./mcp.ts";

const base: StormSignal = {
  now_hpa: 1012, at: "2026-10-22T10:00", tendency: null, change_24h_hpa: null,
  level: "storm likely", worst: { at: "2026-10-24T15:00", fall_3h_hpa: 3.9, change_24h_hpa: -8 },
  window: { from: "2026-10-24T13:00", to: "2026-10-24T16:00" },
  reason: "", horizon_h: 72, note: "",
};

describe("the storm in a few words", () => {
  it("names the level and the day of the worst fall", () => {
    assert.equal(stormWords(base), "Storm likely · Sat");
  });
  it("a fall already under way is now; one later today is today", () => {
    assert.equal(stormWhen({ ...base, worst: { ...base.worst!, at: "2026-10-22T08:00" } }), "now");
    assert.equal(stormWhen({ ...base, worst: { ...base.worst!, at: "2026-10-22T18:00" } }), "today");
  });
  it("says nothing when the barometer sees nothing", () => {
    assert.equal(stormWords({ ...base, level: "none", worst: null }), "");
  });
});
