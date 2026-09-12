import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { once } from "./once.ts";

describe("one save at a time", () => {
  it("drops the taps that land while a save is in flight", async () => {
    const flag = { current: false };
    let saves = 0;
    let finish!: () => void;
    const slow = () => new Promise<void>((r) => { saves += 1; finish = r; });

    const first = once(flag, slow);
    // Three more taps before the record answers — the four-copies bug.
    const dropped = await Promise.all([once(flag, slow), once(flag, slow), once(flag, slow)]);
    finish();
    assert.equal(await first, true);
    assert.deepEqual(dropped, [false, false, false]);
    assert.equal(saves, 1);
  });

  it("takes the next task once the last one has saved", async () => {
    const flag = { current: false };
    let saves = 0;
    await once(flag, async () => { saves += 1; });
    await once(flag, async () => { saves += 1; });
    assert.equal(saves, 2);
  });

  it("never leaves the form locked after a failed save", async () => {
    const flag = { current: false };
    await assert.rejects(once(flag, async () => { throw new Error("record unreachable"); }));
    assert.equal(flag.current, false);
    assert.equal(await once(flag, async () => {}), true);
  });
});
