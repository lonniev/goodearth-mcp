// Which views a stranger may see.
//
// The rule is not "is it harmless" but "does it name a patron or spend their
// sats". Both halves are asserted, because a leak and a surprise bill are
// different failures and only one of them is visible.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_VIEW, GUEST_VIEW, viewFromHash } from "./route.ts";
import { isPublic, PUBLIC_VIEWS, VIEW_KEYS } from "./views.ts";

describe("the public set", () => {
  it("is a subset of the views that exist", () => {
    // A public key the router rejects is a link that lands nowhere.
    for (const k of PUBLIC_VIEWS) {
      assert.ok((VIEW_KEYS as readonly string[]).includes(k), `${k} is not a view`);
    }
  });

  it("holds only pages that read no block and bill nothing", () => {
    // The load-bearing list. Anything naming a grower's ground belongs on the
    // other side of the gate, and this is the assertion that says so out loud
    // rather than leaving it to whoever edits the array next.
    assert.deepEqual([...PUBLIC_VIEWS].sort(), [
      "about", "animal", "pest", "plant", "references", "tree", "welcome",
    ]);
  });

  it("does NOT include a page about someone's farm", () => {
    for (const shut of ["ledger", "map", "crops", "wildlife", "todo",
                        "reports", "favorites", "almanac", "account"]) {
      assert.equal(isPublic(shut as never), false, `${shut} must stay behind the gate`);
    }
  });

  it("guards the account page above all", () => {
    assert.equal(isPublic("account" as never), false);
  });
});

describe("where an empty hash lands", () => {
  it("differs by who is asking", () => {
    // The bare domain means "what is this" to a visitor and "my farm" to a
    // grower. One default for both is what sent a signed-out reader of
    // #/plant to the sign-in gate on a press of back.
    assert.notEqual(GUEST_VIEW, DEFAULT_VIEW);
    assert.equal(isPublic(GUEST_VIEW), true);
    assert.equal(isPublic(DEFAULT_VIEW), false);
  });

  it("still lets a named hash win for either of them", () => {
    assert.equal(viewFromHash("#/plant"), "plant");
    assert.equal(viewFromHash("#/ledger"), "ledger");
    assert.equal(viewFromHash("#/"), null);
    assert.equal(viewFromHash(""), null);
  });

  it("refuses a hash naming nothing, rather than inventing a view", () => {
    assert.equal(viewFromHash("#/../etc/passwd"), null);
    assert.equal(viewFromHash("#/Plant"), "plant");   // case is forgiven
  });
});
