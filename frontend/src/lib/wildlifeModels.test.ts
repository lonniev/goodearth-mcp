// Run: node --experimental-strip-types --test src/lib/wildlifeModels.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeWildlife } from "./wildlifeModels.ts";
import type { WildlifeEventInput } from "./mcp.ts";

const base = { species: "Wood frog", event: "chorus" } as const;
const ok = (i: WildlifeEventInput) => typeof makeWildlife(i, "b1") !== "string";

describe("a weather-triggered event", () => {
  it("is checked as weather, never asked for a calendar date", () => {
    assert.ok(ok({ ...base, driver: "condition", trigger: { after: "03-01", min_night_f: 40, wet: true } }));
  });
  it("needs a temperature or wet ground", () => {
    assert.equal(typeof makeWildlife({ ...base, driver: "condition", trigger: { after: "03-01" } }, "b1"), "string");
  });
});

describe("a moon event", () => {
  it("needs a real phase", () => {
    assert.ok(ok({ ...base, driver: "moon", phase: "full" }));
    assert.ok(!ok({ ...base, driver: "moon" }));
    assert.ok(!ok({ ...base, driver: "moon", phase: "gibbous" as never }));
  });
  it("takes a starting day and which moon to count", () => {
    assert.ok(ok({ ...base, driver: "moon", phase: "new", after: "05-01", nth: 2 }));
    assert.ok(!ok({ ...base, driver: "moon", phase: "new", after: "May 1" }));
    assert.ok(!ok({ ...base, driver: "moon", phase: "new", nth: 4 }));
  });
});
