// Run: node --experimental-strip-types --test src/lib/submit.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IDLE, failed, landed, newItemId, press, withId } from "./submit.ts";

describe("four presses are one row", () => {
  it("ignores every press that arrives while a write is going", () => {
    // THE BUG, as the grower met it: four identical Winter wheat rows from one
    // intention. Presses two, three and four must not start writes of their
    // own.
    let mints = 0;
    const mint = () => `pl-${++mints}`;

    const first = press(IDLE, mint);
    assert.ok(first);
    assert.equal(first.key, "pl-1");

    for (let i = 0; i < 3; i++) {
      assert.equal(press(first, mint), null, `press ${i + 2} started a write`);
    }
    assert.equal(mints, 1, "a press that was ignored still minted an id");
  });

  it("names the same row when a failed write is retried", () => {
    // The id is what stops the duplicate, and a failure is exactly when the
    // grower presses again. A second id here would put the row they meant to
    // fix beside the one they were fixing.
    const mint = () => `pl-${Math.random()}`;
    const first = press(IDLE, mint)!;
    const after = failed(first);
    assert.equal(after.inFlight, false, "a failed write must release the form");

    const retry = press(after, mint);
    assert.ok(retry);
    assert.equal(retry.key, first.key);
  });

  it("takes a fresh id once a write lands, because the next one is a new row", () => {
    const mint = () => `pl-${Math.random()}`;
    const first = press(IDLE, mint)!;
    const after = landed(first);
    assert.deepEqual(after, IDLE);

    const second = press(after, mint)!;
    assert.notEqual(second.key, first.key);
  });
});

describe("the id the row is written under", () => {
  it("replaces whatever the maker minted", () => {
    // The makers mint so a validated row is complete on the spot. That id is
    // fresh per call — the thing that turned four presses into four rows — so
    // the submission's key wins.
    const made = { id: "pl-minted-by-the-maker", crop: "Winter wheat" };
    assert.equal(withId(made, "pl-the-submission").id, "pl-the-submission");
    assert.equal(withId(made, "k").crop, "Winter wheat", "the row was altered");
    assert.equal(made.id, "pl-minted-by-the-maker", "the row was mutated in place");
  });

  it("mints ids that carry their kind and do not collide", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newItemId("wl")));
    assert.equal(ids.size, 500, "two rows in the same millisecond took one id");
    for (const id of ids) assert.match(id, /^wl-[a-z0-9]+-[0-9a-f]{8}$/);
  });
});
