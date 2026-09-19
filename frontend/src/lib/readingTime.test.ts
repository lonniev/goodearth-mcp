// Run: node --experimental-strip-types --test src/lib/readingTime.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readingTime } from "./readingTime.ts";

describe("when an answer's numbers were read", () => {
  it("says nothing when they were read fresh", () => {
    // The ordinary case, and the one that must stay silent: a provenance line
    // reading "read 9:14 · weather from 9:14" would be noise on every page.
    assert.equal(readingTime({ sources: [{}, {}] }), null);
    assert.equal(readingTime(null), null);
    assert.equal(readingTime({}), null);
  });

  it("names the reading time when the service served what it held", () => {
    const at = readingTime({ sources: [{ as_of: "2026-09-18T06:12:03+00:00" }] });
    assert.equal(at?.toISOString(), "2026-09-18T06:12:03.000Z");
  });

  it("takes the oldest part, because that is how old the answer is", () => {
    const at = readingTime({
      sources: [
        { as_of: "2026-09-18T08:00:00Z" },
        { as_of: "2026-09-17T22:15:00Z" },
        {},
      ],
    });
    assert.equal(at?.toISOString(), "2026-09-17T22:15:00.000Z");
  });

  it("ignores a mark it cannot read rather than rendering Invalid Date", () => {
    assert.equal(readingTime({ sources: [{ as_of: "the day before yesterday" }] }), null);
  });
});
