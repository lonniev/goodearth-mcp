// The import is bounded to the block on purpose — an unbounded fetch brings
// back a grower's holidays as well as their farm. These check the request is
// shaped right and the response is read honestly.
//
// Run: node --experimental-strip-types --test src/lib/inaturalist.test.ts

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { boundsFrom, fetchObservations } from "./inaturalist.ts";

const realFetch = globalThis.fetch;
let lastUrl = "";

function stub(body: unknown, status = 200) {
  globalThis.fetch = (async (url: string | URL) => {
    lastUrl = String(url);
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as typeof fetch;
}

beforeEach(() => { lastUrl = ""; });
afterEach(() => { globalThis.fetch = realFetch; });

describe("request shape", () => {
  it("bounds the fetch to the block", async () => {
    stub({ results: [] });
    await fetchObservations({
      user: "grower",
      bounds: boundsFrom({ min_lat: 44.4, min_lon: -73.3, max_lat: 44.5, max_lon: -73.1 }),
    });
    const u = new URL(lastUrl);
    assert.equal(u.searchParams.get("swlat"), "44.4");
    assert.equal(u.searchParams.get("nelng"), "-73.1");
  });

  it("strips a leading @ from the username", async () => {
    stub({ results: [] });
    await fetchObservations({ user: "@grower" });
    assert.equal(new URL(lastUrl).searchParams.get("user_login"), "grower");
  });

  it("refuses an empty username rather than fetching the whole site", async () => {
    stub({ results: [] });
    await assert.rejects(() => fetchObservations({ user: "   " }), /Which iNaturalist user/);
  });

  it("caps per_page so one import cannot pull the world", async () => {
    stub({ results: [] });
    await fetchObservations({ user: "grower", perPage: 5000 });
    assert.equal(new URL(lastUrl).searchParams.get("per_page"), "200");
  });
});

describe("response reading", () => {
  const obs = (extra: Record<string, unknown> = {}) => ({
    id: 42,
    observed_on: "2026-07-31",
    taxon: { preferred_common_name: "Common Sunflower", name: "Helianthus annuus" },
    geojson: { coordinates: [-73.2, 44.48] },
    quality_grade: "research",
    ...extra,
  });

  it("reads species, date and position", async () => {
    stub({ results: [obs()] });
    const [o] = await fetchObservations({ user: "g" });
    assert.equal(o.species, "Common Sunflower");
    assert.equal(o.scientificName, "Helianthus annuus");
    assert.equal(o.observed_on, "2026-07-31");
    assert.equal(o.lat, 44.48);
    assert.equal(o.lng, -73.2);
  });

  it("detects the flowering annotation, which is what can calibrate", async () => {
    stub({ results: [obs({ annotations: [{ controlled_attribute_id: 12, controlled_value_id: 13 }] })] });
    assert.equal((await fetchObservations({ user: "g" }))[0].flowering, true);
  });

  it("does not treat some other annotation as flowering", async () => {
    stub({ results: [obs({ annotations: [{ controlled_attribute_id: 12, controlled_value_id: 15 }] })] });
    assert.equal((await fetchObservations({ user: "g" }))[0].flowering, false);
  });

  it("falls back to the scientific name when there is no common one", async () => {
    stub({ results: [obs({ taxon: { name: "Solidago canadensis" } })] });
    assert.equal((await fetchObservations({ user: "g" }))[0].species, "Solidago canadensis");
  });

  it("says Unidentified rather than inventing a name", async () => {
    stub({ results: [obs({ taxon: {} })] });
    assert.equal((await fetchObservations({ user: "g" }))[0].species, "Unidentified");
  });

  it("drops observations with no date — a report needs one", async () => {
    stub({ results: [obs({ observed_on: null }), obs()] });
    assert.equal((await fetchObservations({ user: "g" })).length, 1);
  });

  it("survives a missing geometry rather than throwing", async () => {
    stub({ results: [obs({ geojson: null })] });
    const [o] = await fetchObservations({ user: "g" });
    assert.equal(o.lat, null);
  });

  it("names a missing user clearly", async () => {
    stub({}, 404);
    await assert.rejects(() => fetchObservations({ user: "nobody" }), /No iNaturalist user/);
  });

  it("reports an upstream failure with its status", async () => {
    stub({}, 503);
    await assert.rejects(() => fetchObservations({ user: "g" }), /503/);
  });
});

describe("a refusal is explained, not numbered", () => {
  // The owner typed an email into the handle field — the browser offered it —
  // and got "iNaturalist replied 422." iNaturalist had said exactly what was
  // wrong in the body it returned, and nothing was reading it.
  it("names the email as the problem, because that is what it is", async () => {
    stub({ error: "Unknown user_id lonniev@gmail.com", status: 422 }, 422);
    await assert.rejects(
      () => fetchObservations({ user: "someone@example.com" }),
      (e: Error) => {
        assert.match(e.message, /email address/);
        assert.match(e.message, /handle/);
        // The bare status must not be what the grower is left holding.
        assert.doesNotMatch(e.message, /^iNaturalist replied 422\.$/);
        return true;
      },
    );
  });

  it("treats 422 and 404 alike, since both mean no such user", async () => {
    for (const status of [404, 422]) {
      stub({ error: "Unknown user_id nobody", status }, status);
      await assert.rejects(
        () => fetchObservations({ user: "nobody" }),
        (e: Error) => {
          assert.match(e.message, /No iNaturalist user called "nobody"/);
          return true;
        },
      );
    }
  });

  it("passes on a server fault as theirs rather than blaming the grower", async () => {
    stub({ error: "upstream timeout" }, 503);
    await assert.rejects(
      () => fetchObservations({ user: "lonniev" }),
      (e: Error) => {
        assert.match(e.message, /upstream timeout/);
        assert.doesNotMatch(e.message, /No iNaturalist user/);
        return true;
      },
    );
  });
});
