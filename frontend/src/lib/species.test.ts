// Identity is fetched; treatment is never generated. These check both halves —
// that a lookup reads honestly, and that the guidance links route rather than
// advise.
//
// Run: node --experimental-strip-types --test src/lib/species.test.ts

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { guidanceLinks, lookupSpecies, photosByName } from "./species.ts";

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

describe("a picture is only shown when the answer admits to the name", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  function serve(results: Record<string, unknown>[]) {
    globalThis.fetch = (async () => ({
      ok: true, status: 200, json: async () => ({ results }),
    })) as unknown as typeof fetch;
  }

  const photo = (id: number, name: string, common: string, rank = "species") => ({
    id, name, rank, preferred_common_name: common, observations_count: 10,
    default_photo: { square_url: `https://example.test/${id}.jpg` },
  });

  it("refuses a swallowtail for a bat", async () => {
    // Battus is a genus of swallowtail butterflies. A substring test accepts
    // it for "Bat" — the letters are right there — and the table then shows a
    // butterfly beside a row about bats.
    serve([photo(1, "Battus", "Pipevine Swallowtails")]);
    const got = await photosByName(["Bat"], "animals");
    assert.equal(got.size, 0);
  });

  it("refuses a butterflyfish for a butterfly", async () => {
    serve([photo(2, "Chaetodon capistratus", "Four-eyed Butterflyfish")]);
    const got = await photosByName(["Butterfly"], "animals");
    assert.equal(got.size, 0);
  });

  it("lets a singular meet its plural, which is how a group is named", async () => {
    // A different word from the refusal above on purpose: the resolver caches
    // a miss, so re-asking "Bat" against a different stub would be testing the
    // cache rather than the matcher.
    serve([photo(3, "Lepidoptera", "Butterflies and Moths", "order")]);
    const got = await photosByName(["Moth "], "animals");
    assert.equal(got.get("Moth"), "https://example.test/3.jpg");
  });

  it("takes the plain match", async () => {
    serve([photo(4, "Falco sparverius", "American Kestrel")]);
    const got = await photosByName(["American kestrel"], "animals");
    assert.equal(got.get("American kestrel"), "https://example.test/4.jpg");
  });

  it("skips the wrong hit and takes a later one that admits", async () => {
    // What the live service actually does: species that outrank a group on
    // observation count come first, and the right answer is further down.
    serve([
      photo(5, "Vulpes vulpes", "Red Fox"),
      photo(6, "Canis latrans", "Coyote"),
    ]);
    const got = await photosByName(["Coyote"], "animals");
    assert.equal(got.get("Coyote"), "https://example.test/6.jpg");
  });

  it("survives a name with regex punctuation in it", async () => {
    // "Blue-spotted salamander" has a hyphen; an unescaped name would build a
    // broken pattern or match the wrong thing.
    serve([photo(7, "Ambystoma laterale", "Blue-spotted Salamander")]);
    const got = await photosByName(["Blue-spotted salamander"], "animals");
    assert.equal(got.get("Blue-spotted salamander"), "https://example.test/7.jpg");
  });

  it("returns nothing rather than throwing when the search fails", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    assert.equal((await photosByName(["Fisher"], "animals")).size, 0);
  });
});
