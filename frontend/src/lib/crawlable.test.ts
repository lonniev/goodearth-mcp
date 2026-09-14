// A reader without JavaScript can tell what Good Earth is.
//
// The site is a single-page app, and its HTML used to carry an empty
// <div id="root">. An AI assistant asked about it fetched the page without
// running scripts, found "a page that returns no content" on a domain full of
// payment words, and told a gardener to avoid it. robots.txt, sitemap.xml and
// llms.txt did not exist either; the host's fallback answered each with the
// app's HTML.
//
// These guard the front door a crawler reads, the structured data, and the
// three plain files — and that none of them names the owner's own ground.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const html = await readFile("index.html", "utf8");
const words = (s: string) => s.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")
  .split(/\s+/).filter(Boolean);

describe("the front door a crawler reads", () => {
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/)?.[1] ?? "";

  it("says what the thing is, in words, before any script runs", () => {
    assert.ok(words(root).length >= 150, `only ${words(root).length} words outside scripts`);
  });

  it("uses the words a grower would search for", () => {
    const text = words(root).join(" ").toLowerCase();
    for (const w of ["garden", "farm", "frost", "planting", "soil", "degree days"]) {
      assert.ok(text.includes(w), `the front door never says "${w}"`);
    }
  });

  it("never names a treatment it would recommend", () => {
    assert.match(words(root).join(" "), /never recommends a pesticide or treatment/);
  });

  it("describes itself as structured data a search engine can read", () => {
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(ld, "no JSON-LD");
    const data = JSON.parse(ld);
    assert.equal(data["@type"], "WebApplication");
    assert.equal(data.name, "Good Earth");
    assert.match(data.description, /garden/i);
  });
});

describe("the plain files a crawler asks for first", () => {
  it("robots.txt allows reading and names the sitemap", async () => {
    const t = await readFile("public/robots.txt", "utf8");
    assert.match(t, /^User-agent: \*$/m);
    assert.match(t, /^Sitemap: https:\/\/goodearth\.tollbooth-dpyc\.com\/sitemap\.xml$/m);
  });

  it("sitemap.xml is a sitemap", async () => {
    assert.match(await readFile("public/sitemap.xml", "utf8"), /<urlset[\s\S]*<loc>https:\/\/goodearth/);
  });

  it("llms.txt follows the format: a title, a one-line summary, sections", async () => {
    const t = await readFile("public/llms.txt", "utf8");
    assert.match(t, /^# Good Earth\n\n> .*garden/);
    assert.match(t, /^## What it deliberately does not do$/m);
  });

  it("names no one's own plot or town in anything a stranger reads", async () => {
    const all = html + await readFile("public/llms.txt", "utf8") + await readFile("public/robots.txt", "utf8");
    for (const place of ["frogdale", "panton", "addison"]) {
      assert.ok(!all.toLowerCase().includes(place), `${place} is on the public front door`);
    }
  });
});
