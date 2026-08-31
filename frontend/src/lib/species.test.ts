// Identity is fetched; treatment is never generated. These check both halves —
// that a lookup reads honestly, and that the guidance links route rather than
// advise.
//
// Run: node --experimental-strip-types --test src/lib/species.test.ts

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { guidanceLinks, lookupSpecies } from "./species.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stub(routes: Record<string, unknown>, status = 200) {
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    const key = Object.keys(routes).find((k) => u.includes(k)) ?? "";
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => routes[key] ?? {},
    } as Response;
  }) as typeof fetch;
}

const hit = {
  id: 47153, name: "Cydia pomonella", preferred_common_name: "Codling Moth",
  rank: "species", wikipedia_url: "http://en.wikipedia.org/wiki/Codling_moth",
  default_photo: { medium_url: "https://x/p.jpg", attribution: "(c) someone, CC BY-NC" },
};

describe("lookupSpecies", () => {
  it("resolves a common name to its scientific name", async () => {
    stub({ "/taxa?": { results: [hit] }, "/taxa/47153": { results: [{ wikipedia_summary: "<p>A moth.</p>" }] } });
    const got = await lookupSpecies("codling moth");
    assert.equal(got?.scientificName, "Cydia pomonella");
    assert.equal(got?.commonName, "Codling Moth");
  });

  it("strips the markup out of the summary", async () => {
    stub({ "/taxa?": { results: [hit] },
           "/taxa/47153": { results: [{ wikipedia_summary: "<p>A <b>moth</b>.</p>" }] } });
    assert.equal((await lookupSpecies("codling moth 2"))?.summary, "A moth.");
  });

  it("returns null for a name nothing matches, rather than a near neighbour", async () => {
    stub({ "/taxa?": { results: [] } });
    assert.equal(await lookupSpecies("wibble beetle"), null);
  });

  it("keeps the identity when the summary lookup fails", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes("/taxa/")) throw new Error("boom");
      return { ok: true, status: 200, json: async () => ({ results: [hit] }) } as Response;
    }) as typeof fetch;
    const got = await lookupSpecies("codling moth 3");
    assert.equal(got?.scientificName, "Cydia pomonella");
    assert.equal(got?.summary, null);
  });

  it("carries photo attribution, because the photograph is someone's", async () => {
    stub({ "/taxa?": { results: [hit] }, "/taxa/47153": { results: [{}] } });
    assert.match((await lookupSpecies("codling moth 4"))?.photo?.attribution ?? "", /CC BY-NC/);
  });

  it("declines an empty name instead of fetching", async () => {
    let called = false;
    globalThis.fetch = (async () => { called = true; return {} as Response; }) as typeof fetch;
    assert.equal(await lookupSpecies("   "), null);
    assert.equal(called, false);
  });
});

describe("guidanceLinks — routes, never advises", () => {
  it("names the jurisdiction when one is known", () => {
    const [first] = guidanceLinks("Codling moth", "pest", "Vermont");
    assert.match(first.label, /Vermont/);
    assert.match(decodeURIComponent(first.url), /Vermont/);
  });

  it("still routes somewhere when the jurisdiction is unknown", () => {
    const links = guidanceLinks("Codling moth", "pest", null);
    assert.ok(links.length >= 1);
    assert.doesNotMatch(links[0].label, /null|undefined/);
  });

  it("scopes the search to extension sites rather than the open web", () => {
    const [first] = guidanceLinks("Codling moth", "pest", "Vermont");
    assert.match(decodeURIComponent(first.url), /site:edu/);
  });

  it("adds IPM centers for a pest but not for a crop", () => {
    assert.equal(guidanceLinks("Codling moth", "pest", "Vermont").length, 2);
    assert.equal(guidanceLinks("Dahlia", "crop", "Vermont").length, 1);
  });

  it("says every link is a search, not a recommendation", () => {
    const [first] = guidanceLinks("Codling moth", "pest", "Vermont");
    assert.match(first.note ?? "", /authority, not this app/);
  });

  it("never emits a treatment, a product or a rate", () => {
    // The guard that matters: nothing here may read as a prescription.
    // Word boundaries, not substrings — a naive contains() flagged "rate"
    // inside "Integrated pest management", which is exactly the kind of false
    // alarm that gets a real guard deleted.
    const all = JSON.stringify(guidanceLinks("Codling moth", "pest", "Vermont")).toLowerCase();
    const banned = /\b(spray|apply|dose|rates?|insecticide|fungicide|pesticide|ml\/|oz\/|per acre)\b/;
    const hit = all.match(banned);
    assert.equal(hit, null, `guidance must not read as a prescription, found "${hit?.[0]}"`);
  });
});
