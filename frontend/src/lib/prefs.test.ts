// A preference saved before a new one existed must not leave that new one
// missing. Run: node --experimental-strip-types --test src/lib/prefs.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
// prefs.ts reads `window.localStorage`; tollbooth-web reads `globalThis.localStorage`.
(globalThis as { window?: unknown }).window = { localStorage };
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });

const { readPrefs, writePrefs, DEFAULTS } = await import("./prefs.ts");

beforeEach(() => store.clear());

describe("prefs", () => {
  it("defaults the bees on — they are an instrument, not a decoration", () => {
    assert.equal(readPrefs().bees, true);
    assert.equal(DEFAULTS.bees, true);
  });

  it("round-trips a change", () => {
    writePrefs({ ...DEFAULTS, bees: false });
    assert.equal(readPrefs().bees, false);
  });

  it("defaults to Fahrenheit, which is what the record is kept in", () => {
    assert.equal(readPrefs().units, "F");
  });

  it("round-trips Celsius without touching anything else", () => {
    writePrefs({ ...DEFAULTS, units: "C" });
    assert.equal(readPrefs().units, "C");
    assert.equal(readPrefs().bees, true);
  });

  it("merges over the defaults, so a preference added later is present", () => {
    // What an older save looks like: an object missing today's keys.
    store.set("goodearth:prefs:v1", JSON.stringify({}));
    assert.equal(readPrefs().bees, true);
  });

  it("falls back to the defaults on unreadable storage", () => {
    store.set("goodearth:prefs:v1", "{not json");
    assert.deepEqual(readPrefs(), DEFAULTS);
  });

  it("never hands back the shared DEFAULTS object to be mutated", () => {
    const a = readPrefs();
    a.bees = false;
    assert.equal(DEFAULTS.bees, true);
  });
});

describe("the season the page wears", () => {
  it("follows the calendar by default", async () => {
    const { DEFAULTS, themeOf } = await import("./prefs.ts");
    assert.equal(DEFAULTS.theme, "follow");
    assert.equal(themeOf(DEFAULTS, 44, new Date("2026-04-15")), "spring");
    assert.equal(themeOf(DEFAULTS, 44, new Date("2026-07-15")), "summer");
    assert.equal(themeOf(DEFAULTS, 44, new Date("2026-10-15")), "autumn");
    assert.equal(themeOf(DEFAULTS, 44, new Date("2026-01-15")), "winter");
  });

  it("stays put when a season is chosen outright", async () => {
    const { DEFAULTS, themeOf } = await import("./prefs.ts");
    const winter = { ...DEFAULTS, theme: "winter" as const };
    assert.equal(themeOf(winter, 44, new Date("2026-07-15")), "winter");
  });

  it("is remembered per device, beside the other viewing choices", async () => {
    const { DEFAULTS, readPrefs, writePrefs } = await import("./prefs.ts");
    writePrefs({ ...DEFAULTS, theme: "autumn" });
    assert.equal(readPrefs().theme, "autumn");
  });

  it("gives an older saved preference the default rather than nothing", async () => {
    const { readPrefs } = await import("./prefs.ts");
    store.set("goodearth:prefs:v1", JSON.stringify({ bees: false }));
    assert.equal(readPrefs().theme, "follow");
  });
});

describe("the chart order", () => {
  it("starts empty, meaning the order the charts ship in", () => {
    assert.deepEqual(readPrefs().chartOrder, []);
  });

  it("round-trips an arrangement", () => {
    writePrefs({ ...DEFAULTS, chartOrder: ["precip", "temp_max"] });
    assert.deepEqual(readPrefs().chartOrder, ["precip", "temp_max"]);
  });

  it("is present for someone who saved before it existed", () => {
    // The stored object predates the field entirely.
    window.localStorage.setItem("goodearth:prefs:v1",
      JSON.stringify({ bees: false, units: "C", theme: "winter" }));
    const p = readPrefs();
    assert.deepEqual(p.chartOrder, []);
    assert.equal(p.bees, false);
  });

  it("refuses a stored value of the wrong shape", () => {
    // A list is what sorts the charts. Anything else would be handed to code
    // that expects to iterate names, and a preference file is not a thing this
    // app controls the contents of.
    for (const bad of ['"precip"', "42", "null", "{}", '{"a":1}']) {
      window.localStorage.setItem("goodearth:prefs:v1", `{"chartOrder":${bad}}`);
      assert.deepEqual(readPrefs().chartOrder, [], `chartOrder: ${bad}`);
    }
  });

  it("drops entries that are not names", () => {
    window.localStorage.setItem("goodearth:prefs:v1",
      '{"chartOrder":["precip",7,null,"wind_max"]}');
    assert.deepEqual(readPrefs().chartOrder, ["precip", "wind_max"]);
  });
});

describe("settings that follow the account", async () => {
  const web = await import("@tollbooth-dpyc/web");
  const sets: [string, string][] = [];
  const declared = (name: string, dflt: unknown, follows = "account") => ({
    name, kind: "text", label: name, description: "", default: dflt, follows,
    value: dflt, is_default: true, updated_at: "",
  });

  beforeEach(async () => {
    store.clear();
    sets.length = 0;
    web.configureTollbooth({ slug: "goodearth", appName: "Good Earth", mcpUrl: "/mcp" });
    web.setStoredNpub("npub1grower");
    store.set("goodearth:prop-synced:npub1grower", "earlier");
    web.answerPropertyTools({
      get: async () => ({ success: true, properties: [
        { ...declared("units", "F"), value: "C", is_default: false },
        { ...declared("array_w_m", 24), value: 30, is_default: false },
        declared("sell_cents", null),
        declared("bees", true, "device"),
      ] }),
      set: async (name, value) => { sets.push([name, value]); return { success: true }; },
    });
    await web.syncProperties("npub1grower");
  });

  it("brings the account's values into this device's settings, under the same key", () => {
    const p = readPrefs();
    assert.equal(p.units, "C");
    assert.deepEqual(p.array, { w: 30, l: 12 });
    assert.ok(store.get("goodearth:prefs:v1"));
  });

  it("keeps a changed account field with the account, and a device one here", async () => {
    writePrefs({ ...readPrefs(), units: "F", bees: false, sellCents: 11 });
    writePrefs({ ...readPrefs(), sellCents: null });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(sets, [["units", "F"], ["sell_cents", "11"], ["sell_cents", ""]]);
  });
});
