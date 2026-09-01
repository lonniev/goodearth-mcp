// The view in the URL — what a refresh, a link, and a back button get.
//
// Run: node --experimental-strip-types --test src/lib/route.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VIEW_KEYS } from "./views.ts";
import { DEFAULT_VIEW, viewFromHash } from "./route.ts";

describe("viewFromHash", () => {
  it("reads the view a refresh will land on", () => {
    assert.equal(viewFromHash("#/almanac"), "almanac");
    assert.equal(viewFromHash("#/wildlife"), "wildlife");
  });

  it("accepts a hash written without the slash", () => {
    assert.equal(viewFromHash("#crops"), "crops");
  });

  it("is case-insensitive, because a pasted link may not be", () => {
    assert.equal(viewFromHash("#/Almanac"), "almanac");
  });

  it("returns null for a hash that names no view", () => {
    // Null rather than the default: the caller decides what to fall back to,
    // and a typo'd link must not silently look like a deliberate one.
    assert.equal(viewFromHash("#/nonsense"), null);
    assert.equal(viewFromHash("#/"), null);
    assert.equal(viewFromHash(""), null);
  });

  it("does not accept a prefix of a real view", () => {
    assert.equal(viewFromHash("#/alma"), null);
    assert.equal(viewFromHash("#/almanacs"), null);
  });

  it("round-trips every view the app can show", () => {
    // The routable set and the switchable set are one list. If they were two,
    // a view could be reachable in the app and rejected by the URL, and the
    // symptom would be a link that quietly lands on the ledger instead.
    for (const v of VIEW_KEYS) assert.equal(viewFromHash(`#/${v}`), v);
  });

  it("has a default that is itself a real view", () => {
    assert.ok((VIEW_KEYS as readonly string[]).includes(DEFAULT_VIEW));
  });
});
