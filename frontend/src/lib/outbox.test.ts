// A field entry made without signal waits, and arrives once — for the grower
// who made it. Run: node --experimental-strip-types --test src/lib/outbox.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
};

const {
  enqueue, entries, waiting, refused, flush, discard, isNetworkFailure,
  pendingItems, overlay, overlayTasks, QUEUEABLE, OUTBOX_KEY,
} = await import("./outbox.ts");

const ME = "npub1me";
const THEM = "npub1them";

beforeEach(() => store.clear());

const offline = () => Promise.reject(new TypeError("Failed to fetch"));

describe("what waits", () => {
  it("queues only the writes a grower makes in the field", () => {
    for (const t of ["block_item_save", "task_save", "task_set_done", "task_delete"]) assert.ok(QUEUEABLE.has(t));
    // An answer needs the weather; queueing one would only delay a failure.
    for (const t of ["crop_gdd_status", "frost_window", "block_item_list", "task_list"]) assert.ok(!QUEUEABLE.has(t));
  });

  it("survives a reload: the queue is in the browser's storage, not in memory", () => {
    enqueue(ME, "task_save", { task_id: "t1", title: "Cut zinnias" });
    assert.equal(JSON.parse(store.get(OUTBOX_KEY)!).length, 1);
  });

  it("never stores the proof or the npub inside a call's arguments", () => {
    enqueue(ME, "task_save", { task_id: "t1", title: "x" });
    const raw = store.get(OUTBOX_KEY)!;
    assert.ok(!/dpop_token/.test(raw));
    assert.deepEqual(Object.keys(entries()[0].args), ["task_id", "title"]);
  });
});

describe("sending what waited", () => {
  it("sends in the order the entries were made, and empties the line", async () => {
    enqueue(ME, "block_item_save", { block: "b", kind: "observation", items: [{ item_id: "a" }] });
    enqueue(ME, "block_item_save", { block: "b", kind: "observation", retire_ids: ["a"] });
    const seen: string[] = [];
    const r = await flush(ME, async (tool, args) => {
      seen.push(args.retire_ids ? "retire" : "save");
      return { success: true };
    });
    assert.deepEqual(seen, ["save", "retire"]);
    assert.deepEqual(r, { sent: 2, left: 0 });
    assert.equal(entries().length, 0);
  });

  it("stops at the first sign the signal is still gone, and keeps everything", async () => {
    enqueue(ME, "task_save", { task_id: "t1", title: "a" });
    enqueue(ME, "task_save", { task_id: "t2", title: "b" });
    let calls = 0;
    const r = await flush(ME, () => { calls++; return offline(); });
    assert.equal(calls, 1, "a second try on no signal only burns battery");
    assert.equal(r.stoppedBy, "signal");
    assert.equal(waiting(ME).length, 2);
  });

  it("waits for a fresh sign-in rather than refusing the entry", async () => {
    enqueue(ME, "task_save", { task_id: "t1", title: "a" });
    const bounce = Object.assign(new Error("Sign-in required."), { name: "ProofRequiredError" });
    const r = await flush(ME, () => Promise.reject(bounce));
    assert.equal(r.stoppedBy, "sign-in");
    assert.equal(waiting(ME).length, 1);
    assert.equal(refused(ME).length, 0);
  });

  it("keeps an entry the server could not take just now", async () => {
    enqueue(ME, "task_save", { task_id: "t1", title: "a" });
    const r = await flush(ME, async () => ({ success: false, error_code: "persistence_unavailable" }));
    assert.equal(r.stoppedBy, "server");
    assert.equal(waiting(ME).length, 1);
  });

  it("sets aside an entry the server refuses, says why, and sends the rest", async () => {
    enqueue(ME, "task_save", { task_id: "t1", title: "" });
    enqueue(ME, "task_save", { task_id: "t2", title: "b" });
    const r = await flush(ME, async (_t, a) =>
      a.title ? { success: true } : { success: false, error: "a task needs a title", error_code: "invalid_request" });
    assert.equal(r.sent, 1);
    assert.equal(refused(ME)[0].refused, "a task needs a title");
    discard(refused(ME)[0].id);
    assert.equal(entries().length, 0);
  });

  it("delivers a grower's entries only while that grower is signed in", async () => {
    enqueue(THEM, "task_save", { task_id: "t1", title: "their note" });
    const sent: unknown[] = [];
    await flush(ME, async (_t, a) => { sent.push(a); return { success: true }; });
    assert.deepEqual(sent, [], "the phone changed hands; their note must not land in my record");
    assert.equal(waiting(THEM).length, 1);
  });

  it("drains once when asked several times at once", async () => {
    enqueue(ME, "task_save", { task_id: "t1", title: "a" });
    let calls = 0;
    const send = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return { success: true }; };
    await Promise.all([flush(ME, send), flush(ME, send), flush(ME, send)]);
    assert.equal(calls, 1);
  });
});

describe("telling no signal from a refusal", () => {
  it("reads each browser's wording for a lost connection", () => {
    for (const m of [
      "Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed",
      "The Internet connection appears to be offline.", "Request timed out",
      "Error POSTing to endpoint (HTTP 503): Service Unavailable",
    ]) assert.ok(isNetworkFailure(new Error(`goodearth_task_save: ${m}`)), m);
  });

  it("does not mistake the server saying no for no signal", () => {
    assert.ok(!isNetworkFailure(new Error("a task needs a title")));
    assert.ok(!isNetworkFailure(new Error("Input validation error: 'items' is a required property")));
  });

  it("believes the browser when it says it is offline", () => {
    assert.ok(isNetworkFailure(new Error("anything"), false));
  });
});

describe("what a view shows while it waits", () => {
  type Row = { id: string; note: string };
  const from = (r: Record<string, unknown>): Row => ({ id: String(r.item_id), note: String(r.note ?? "") });

  it("lays waiting edits, removals and new rows over what the server last gave", () => {
    enqueue(ME, "block_item_save", { block: "b", kind: "observation", items: [{ item_id: "new", note: "cut 40 stems" }] });
    enqueue(ME, "block_item_save", { block: "b", kind: "observation", items: [{ item_id: "x", note: "edited" }] });
    enqueue(ME, "block_item_save", { block: "b", kind: "observation", retire_ids: ["y"] });
    enqueue(ME, "block_item_save", { block: "other", kind: "observation", items: [{ item_id: "z" }] });
    const o = pendingItems(entries(), ME, "b", "observation");
    const shown = overlay<Row>([{ id: "x", note: "old" }, { id: "y", note: "gone" }], o, (r) => r.id, from);
    assert.deepEqual(shown, [{ id: "new", note: "cut 40 stems" }, { id: "x", note: "edited" }]);
  });

  it("keeps a season's waiting plantings to that season", () => {
    enqueue(ME, "block_item_save", { block: "b", kind: "planting", season: 2025, items: [{ item_id: "old" }] });
    assert.equal(pendingItems(entries(), ME, "b", "planting", 2026).saves.size, 0);
    assert.equal(pendingItems(entries(), ME, "b", "planting", 2025).saves.size, 1);
  });

  it("shows waiting task saves, ticks and deletions", () => {
    type T = { id: string; title: string; done: boolean };
    enqueue(ME, "task_save", { region_id: "r", task_id: "n", title: "New" });
    enqueue(ME, "task_set_done", { task_id: "a", done: true });
    enqueue(ME, "task_delete", { task_id: "b" });
    const { rows, pending } = overlayTasks<T>(
      [{ id: "a", title: "A", done: false }, { id: "b", title: "B", done: false }],
      entries(), ME, "r", (a) => ({ id: String(a.task_id), title: String(a.title), done: false }),
    );
    assert.deepEqual(rows, [{ id: "n", title: "New", done: false }, { id: "a", title: "A", done: true }]);
    assert.deepEqual([...pending].sort(), ["a", "n"]);
  });
});
