import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { horizonOf } from "./eventHorizon.ts";

const curve = {
  curve: { dates: ["2026-10-22", "2026-10-23", "2026-10-24"] },
  forecast: { dates: ["2026-10-25", "2026-10-26"], cumulative: [1, 2] },
} as unknown as Parameters<typeof horizonOf>[1];

describe("which stretch of the season a mark falls in", () => {
  it("a dated mark is read by its date, never its placeholder index", () => {
    const task = (date: string) => ({ anchor: "date" as const, date, index: 0 });
    assert.equal(horizonOf(task("2026-10-20"), curve), "recorded");
    assert.equal(horizonOf(task("2026-10-24"), curve), "recorded");
    assert.equal(horizonOf(task("2026-10-26"), curve), "forecast");
    assert.equal(horizonOf(task("2026-11-30"), curve), "projected");
  });
  it("a mark placed by heat is read by its index", () => {
    const at = (index: number) => ({ index } as Parameters<typeof horizonOf>[0]);
    assert.equal(horizonOf(at(1), curve), "recorded");
    assert.equal(horizonOf(at(3), curve), "forecast");
    assert.equal(horizonOf(at(5), curve), "projected");
  });
});
