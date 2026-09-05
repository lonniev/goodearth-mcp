// A preference saved before a new one existed must not leave that new one
// missing. Run: node --experimental-strip-types --test src/lib/prefs.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
};

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
    assert.equal(themeOf(DEFAULTS, new Date("2026-04-15")), "spring");
    assert.equal(themeOf(DEFAULTS, new Date("2026-07-15")), "summer");
    assert.equal(themeOf(DEFAULTS, new Date("2026-10-15")), "autumn");
    assert.equal(themeOf(DEFAULTS, new Date("2026-01-15")), "winter");
  });

  it("stays put when a season is chosen outright", async () => {
    const { DEFAULTS, themeOf } = await import("./prefs.ts");
    const winter = { ...DEFAULTS, theme: "winter" as const };
    assert.equal(themeOf(winter, new Date("2026-07-15")), "winter");
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
