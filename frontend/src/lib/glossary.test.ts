// Run: node --experimental-strip-types --test src/lib/glossary.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { define, GLOSSARY, GROUPS, searchGlossary } from "./glossary.ts";

describe("the glossary is one source, not a second copy", () => {
  it("every inline Term names a key that exists", async () => {
    // The whole reason this file exists. The definitions used to be JSX inside
    // whichever view needed one, so a glossary page would have been a second
    // copy — right on the day it shipped and drifting from then on. A `Term`
    // pointing at a key nobody defined shows an empty tooltip and no error.
    const { readdir, readFile } = await import("node:fs/promises");
    const missing: string[] = [];
    for (const root of ["src/views", "src/components"]) {
      for (const f of await readdir(root)) {
        if (!f.endsWith(".tsx") || f.includes(".test.")) continue;
        const txt = await readFile(`${root}/${f}`, "utf8");
        for (const m of txt.matchAll(/\bof="([a-z_]+)"/g)) {
          if (!define(m[1])) missing.push(`${root}/${f}: of="${m[1]}"`);
        }
      }
    }
    assert.deepEqual(missing, []);
  });

  it("has no duplicate keys", () => {
    const keys = GLOSSARY.map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("files every entry under a group the page renders", () => {
    // An entry in a group with no heading is an entry nobody can browse to.
    const known = new Set(GROUPS.map((g) => g.key));
    for (const e of GLOSSARY) {
      assert.ok(known.has(e.group), `${e.key} is in group "${e.group}", which has no heading`);
    }
  });

  it("gives every entry a term and a definition that says something", () => {
    for (const e of GLOSSARY) {
      assert.ok(e.term.trim(), `${e.key} has no term`);
      assert.ok(e.said.trim().length > 40, `${e.key}'s definition is too thin to help`);
    }
  });

  it("carries no markup, since the page renders these as prose", () => {
    for (const e of GLOSSARY) {
      assert.doesNotMatch(e.said, /<[a-z/]/i, `${e.key} contains markup`);
    }
  });
});

describe("finding a word you half remember", () => {
  it("matches the term", () => {
    assert.ok(searchGlossary("chill").some((e) => e.key === "chill_hours"));
  });

  it("matches another name for it", () => {
    // "GDD" is what a grower actually reads on the page; the entry is filed
    // under its full name.
    assert.ok(searchGlossary("GDD").some((e) => e.key === "gdd"));
    assert.ok(searchGlossary("photoperiod").some((e) => e.key === "daylight"));
  });

  it("matches the definition, not only the heading", () => {
    // Somebody who remembers "the grey band on the chart" does not know it is
    // filed under Normal.
    assert.ok(searchGlossary("grey band").some((e) => e.key === "normal"));
  });

  it("ignores case and surrounding space", () => {
    assert.deepEqual(searchGlossary("  BIOFIX ").map((e) => e.key), ["biofix"]);
  });

  it("returns everything for an empty search rather than nothing", () => {
    assert.equal(searchGlossary("   ").length, GLOSSARY.length);
  });

  it("returns nothing for a word it does not hold", () => {
    assert.deepEqual(searchGlossary("cryptozoology"), []);
  });
});
