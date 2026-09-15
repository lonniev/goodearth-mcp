// Looking up days to maturity — and refusing to guess one.
// Run: node --experimental-strip-types --test src/lib/growstuff.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cropUrl, daysFrom, pickCrop, searchUrl, termFor, type GrowstuffHit } from "./growstuff.ts";

// Shaped as the live search returns them (verified 2026-09-15).
const LACINATO: GrowstuffHit = {
  slug: "lacinato-kale", name: "lacinato kale", plantings_count: 15,
  alternate_names: ["Tuscan kale", "Dinosaur kale", "cavolo nero"],
  scientific_names: ["Brassica oleracea Acephala group"],
  scientific_name: "Brassica oleracea Acephala group",
};
const KALE: GrowstuffHit = {
  slug: "kale", name: "kale", plantings_count: 400,
  scientific_names: ["Brassica oleracea"], scientific_name: "Brassica oleracea",
};
const ZINNIA: GrowstuffHit = { slug: "zinnia", name: "zinnia", plantings_count: 3 };

describe("what to ask for", () => {
  it("names the variety and the crop together", () => {
    assert.equal(termFor({ crop: "Kale", variety: "Lacinato" }), "Lacinato Kale");
    assert.equal(termFor({ crop: "Kale" }), "Kale");
    assert.equal(searchUrl("Lacinato Kale"), "https://www.growstuff.org/crops/search.json?term=Lacinato%20Kale");
    assert.equal(cropUrl("lacinato-kale"), "https://www.growstuff.org/crops/lacinato-kale.json");
  });
});

describe("which crop answered", () => {
  const hits = [KALE, LACINATO, ZINNIA];

  it("takes the variety over the species — they are different figures", () => {
    assert.equal(pickCrop(hits, { crop: "Kale", variety: "Lacinato" })?.slug, "lacinato-kale");
  });

  it("falls back to the crop when the variety is not one the commons knows", () => {
    assert.equal(pickCrop(hits, { crop: "Kale", variety: "Redbor" })?.slug, "kale");
  });

  it("matches a variety by the names it also goes by", () => {
    assert.equal(pickCrop(hits, { crop: "kale", variety: "cavolo nero" })?.slug, "lacinato-kale");
  });

  it("would rather say nothing than name the wrong plant", () => {
    assert.equal(pickCrop(hits, { crop: "Rhubarb", variety: "Victoria" }), null);
    assert.equal(pickCrop([], { crop: "Kale" }), null);
    // The grower picked a daisy; a match named as a brassica is not it.
    assert.equal(pickCrop([KALE], { crop: "Kale", scientificName: "Zinnia elegans" }), null);
  });

  it("prefers the crop more growers have recorded", () => {
    const quiet = { ...KALE, slug: "kale-quiet", plantings_count: 2 };
    assert.equal(pickCrop([quiet, KALE], { crop: "Kale" })?.slug, "kale");
  });
});

describe("the figure itself", () => {
  it("is the median days to first harvest, when there is one", () => {
    assert.equal(daysFrom({ median_days_to_first_harvest: 58 }), 58);
    assert.equal(daysFrom({ median_days_to_first_harvest: 57.6 }), 58);
  });

  it("is nothing when nobody has recorded a harvest", () => {
    for (const v of [null, undefined, 0, "", "soon"]) {
      assert.equal(daysFrom({ median_days_to_first_harvest: v }), null, String(v));
    }
  });
});

describe("the source is named where the site names its sources", () => {
  it("References carries Growstuff, with its licence", () => {
    const page = readFileSync(new URL("../views/References.tsx", import.meta.url), "utf8");
    assert.match(page, /growstuff\.org/i);
    assert.match(page, /CC[- ]BY[- ]SA/i);
  });

  it("nothing claims to look up what only the packet knows", () => {
    // The code, not the comments — the file's opening paragraph names these
    // fields precisely to say they are the packet's and are never fetched.
    const src = readFileSync(new URL("./growstuff.ts", import.meta.url), "utf8")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /germination_pct|germinationPct|tested_on|packed_for|quantity|supplier/);
  });
});
