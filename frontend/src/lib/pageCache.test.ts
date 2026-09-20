// Run: node --experimental-strip-types --test src/lib/pageCache.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cached, forget, forgetAll, isHeld, TTL_MS, useClock, warm } from "./pageCache.ts";

let now = 0;
useClock(() => now);

beforeEach(() => { forgetAll(); now = 1_000_000; });

describe("an answer a page has already asked for", () => {
  it("is asked for once and served twice", async () => {
    let asked = 0;
    const run = async () => { asked += 1; return { success: true, n: asked }; };

    assert.deepEqual(await cached("k", run), { success: true, n: 1 });
    assert.deepEqual(await cached("k", run), { success: true, n: 1 });
    assert.equal(asked, 1);
  });

  it("is joined in flight rather than started again", async () => {
    // The case that makes warming worth anything: the view mounts while the
    // warmed call is still in the air. A cache that only held RESULTS would
    // miss here and fire a second request a few hundred milliseconds behind
    // the first — two fares, and no faster.
    let asked = 0;
    let release: (v: unknown) => void = () => {};
    const run = () => { asked += 1; return new Promise((r) => { release = r; }); };

    const a = cached("k", run);
    const b = cached("k", run);
    release({ success: true });
    assert.equal(await a, await b);
    assert.equal(asked, 1);
  });

  it("is forgotten once it is old enough to mislead", async () => {
    let asked = 0;
    const run = async () => { asked += 1; return { success: true }; };

    await cached("k", run);
    now += TTL_MS + 1;
    await cached("k", run);
    assert.equal(asked, 2);
  });

  it("is kept apart by its key, so another plot is another answer", async () => {
    let asked = 0;
    const run = async () => { asked += 1; return { success: true }; };
    await cached("ledger|a|50", run);
    await cached("ledger|b|50", run);
    assert.equal(asked, 2);
  });
});

describe("what it refuses to remember", () => {
  it("does not hold a call that threw", async () => {
    let asked = 0;
    const run = async () => { asked += 1; throw new Error("no signal"); };

    await assert.rejects(cached("k", run));
    assert.equal(isHeld("k"), false);
    await assert.rejects(cached("k", run));
    assert.equal(asked, 2, "Try again must actually try again");
  });

  it("does not hold an answer that says no", async () => {
    // A tool answering `success: false` — an expired proof, an empty balance —
    // has not answered. Held, it would make the next five minutes of retries
    // pointless and the grower would be stuck on a page that never loads.
    let asked = 0;
    const run = async () => ({ success: false, error: "proof is required" });

    await cached("k", async () => { asked += 1; return run(); });
    assert.equal(isHeld("k"), false);
  });

  it("drops the oldest rather than growing without end", async () => {
    for (let i = 0; i < 40; i += 1) {
      now += 1;
      await cached(`k${i}`, async () => ({ success: true }));
    }
    assert.equal(isHeld("k0"), false);
    assert.equal(isHeld("k39"), true);
  });

  it("forgets on request, so a refresh is a real one", async () => {
    let asked = 0;
    const run = async () => { asked += 1; return { success: true }; };
    await cached("k", run);
    forget("k");
    await cached("k", run);
    assert.equal(asked, 2);
  });
});

describe("warming", () => {
  it("starts the call without anybody waiting on it", async () => {
    let asked = 0;
    warm("k", async () => { asked += 1; return { success: true }; });
    assert.equal(asked, 1);
    await cached("k", async () => ({ success: true, second: true }));
    assert.equal(asked, 1, "the view must join the warmed call, not start another");
  });

  it("swallows a failure nobody asked about", async () => {
    // Nobody is looking at that page. An unhandled rejection in the console
    // would be the only sign, and it would be noise about a guess.
    warm("k", async () => { throw new Error("offline"); });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(isHeld("k"), false);
  });
});
