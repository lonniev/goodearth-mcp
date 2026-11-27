import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isoDay } from "./zone.ts";

describe("isoDay", () => {
  // 03:30 UTC on Oct 25 is still the evening of Oct 24 in New York.
  const at = new Date("2026-10-25T03:30:00Z");
  it("names the calendar day on the reader's clock, not Greenwich's", () => {
    assert.equal(isoDay(at, "America/New_York"), "2026-10-24");
    assert.equal(isoDay(at, "Asia/Tokyo"), "2026-10-25");
  });
  it("defaults to the chosen zone, which falls back to the browser's", () => {
    assert.match(isoDay(at), /^\d{4}-\d{2}-\d{2}$/);
  });
});
