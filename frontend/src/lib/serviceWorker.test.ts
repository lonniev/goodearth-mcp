// The installed app opens with no signal, and the worker that makes it so
// never keeps a grower's record or touches the MCP.
//
// Runs public/sw.js itself, in a fake worker scope with a fake network and
// cache, rather than reading its source for keywords.
// Run: node --experimental-strip-types --test src/lib/serviceWorker.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://goodearth.tollbooth-dpyc.com";
const PAGE = `<html><script type="module" crossorigin src="/assets/index-abc.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-def.css"></html>`;

type Req = { url: string; method: string; mode?: string };
const req = (path: string, extra: Partial<Req> = {}): Req =>
  ({ url: new URL(path, ORIGIN).href, method: "GET", ...extra });

function worker(net: { online: boolean; body?: (url: string) => string }) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const store = new Map<string, Response>();
  const key = (k: string | Req) => (typeof k === "string" ? new URL(k, ORIGIN).href : k.url);
  const fetched: string[] = [];
  const fetchImpl = async (r: string | Req) => {
    const url = key(r);
    fetched.push(url);
    if (!net.online) throw new TypeError("Failed to fetch");
    return new Response(net.body ? net.body(url) : `fresh ${url}`, { status: 200 });
  };
  const cache = {
    match: async (k: string | Req) => store.get(key(k))?.clone(),
    put: async (k: string | Req, r: Response) => void store.set(key(k), r),
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (k: string | Req) => store.delete(key(k)),
  };
  const self = {
    addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; },
    location: new URL(ORIGIN),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(SRC, {
    self, fetch: fetchImpl, Response, URL,
    caches: { open: async () => cache, keys: async () => ["goodearth-shell-v1", "old"], delete: async () => true },
  });

  async function install() {
    let done: Promise<unknown> = Promise.resolve();
    listeners.install({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  }
  /// Undefined when the worker left the request to the browser.
  async function get(r: Req): Promise<Response | undefined> {
    let answer: Promise<Response> | undefined;
    listeners.fetch({ request: r, respondWith: (p: Promise<Response>) => { answer = p; } });
    return answer ? await answer : undefined;
  }
  return { install, get, store, fetched, net };
}

describe("the app opens without signal", () => {
  it("keeps the page and every file it names when it installs", async () => {
    const w = worker({ online: true, body: (u) => (u === `${ORIGIN}/` ? PAGE : "x") });
    await w.install();
    for (const p of ["/", "/assets/index-abc.js", "/assets/index-def.css", "/manifest.webmanifest"])
      assert.ok(w.store.has(new URL(p, ORIGIN).href), `${p} was not kept`);
  });

  it("serves the kept page when the network is gone", async () => {
    const w = worker({ online: true, body: (u) => (u === `${ORIGIN}/` ? PAGE : "x") });
    await w.install();
    w.net.online = false;
    const res = await w.get(req("/", { mode: "navigate" }));
    assert.equal(await res!.text(), PAGE);
  });

  it("asks the network first for the page, so a new deploy arrives", async () => {
    const w = worker({ online: true });
    const res = await w.get(req("/", { mode: "navigate" }));
    assert.equal(await res!.text(), `fresh ${ORIGIN}/`);
  });

  it("serves a hashed script from the cache without asking the network", async () => {
    const w = worker({ online: true });
    await w.get(req("/assets/index-abc.js"));
    const before = w.fetched.length;
    await w.get(req("/assets/index-abc.js"));
    assert.equal(w.fetched.length, before);
  });
});

describe("the worker keeps the app, never the record", () => {
  it("leaves every call to the MCP alone", async () => {
    const w = worker({ online: true });
    assert.equal(await w.get({ url: "https://goodearth-mcp.fastmcp.app/mcp", method: "POST" }), undefined);
    assert.equal(await w.get({ url: "https://goodearth-mcp.fastmcp.app/mcp", method: "GET" }), undefined);
  });

  it("leaves every write alone, even on its own origin", async () => {
    const w = worker({ online: true });
    assert.equal(await w.get(req("/", { method: "POST" })), undefined);
  });

  it("does not file llms.txt under the page's key", async () => {
    const w = worker({ online: true });
    await w.get(req("/llms.txt", { mode: "navigate" }));
    assert.ok(!w.store.has(`${ORIGIN}/`));
    assert.ok(w.store.has(`${ORIGIN}/llms.txt`));
  });
});
