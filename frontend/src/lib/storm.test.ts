import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FACE, onFace, stormWhen, stormWords } from "./storm.ts";
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

describe("the barometer face", () => {
  it("puts standard pressure in change and a deep low at the stormy end", () => {
    const zone = (h: number) => FACE.zones.find((z) => h >= z.from && h < z.to)?.word;
    assert.equal(zone(1013), "change");
    assert.equal(zone(990), "rain");
    assert.equal(zone(1025), "fair");
    assert.equal(onFace(940), 0);
    assert.equal(onFace(1080), 1);
  });

  it("leaves no gap between its zones", () => {
    FACE.zones.slice(1).forEach((z, i) => assert.equal(z.from, FACE.zones[i].to));
    assert.equal(FACE.zones[0].from, FACE.from);
    assert.equal(FACE.zones.at(-1)!.to, FACE.to);
  });
});
