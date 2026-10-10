// Every working page has a guide, and every guide is a view a reader can
// reach — signed in or not.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GUIDE_KEYS, GUIDE_META, GUIDED, guideFor, pageOf } from "./guides.ts";
import { isPublic, VIEW_KEYS } from "./views.ts";

describe("the guided pages", () => {
  it("are the working pages on the rail, and nothing else", () => {
    assert.deepEqual([...GUIDED], [
      "plots", "ledger", "almanac", "crops", "pests", "wildlife", "todo", "reports",
    ]);
  });

  it("each have a guide that is a view, and a free one", () => {
    for (const k of GUIDE_KEYS) {
      assert.ok((VIEW_KEYS as readonly string[]).includes(k), `${k} is not a view`);
      // A guide reads no block and bills nothing, so a stranger may read it.
      assert.equal(isPublic(k as never), true, `${k} is behind the gate`);
    }
  });

  it("each have a title, an eyebrow and a card line", () => {
    for (const p of GUIDED) {
      const m = GUIDE_META[p];
      assert.ok(m.title && m.emoji && m.eyebrow && m.said, `${p} is missing its words`);
    }
  });
});

describe("finding the guide for a page", () => {
  it("names the guide of a working page", () => {
    assert.equal(guideFor("plots"), "how-plots");
    assert.equal(guideFor("reports"), "how-reports");
  });

  it("offers nothing for a page with no guide", () => {
    // The guides themselves, the account page and the free reading have no
    // (?) — a guide to a guide is a loop, and the explainers are their own.
    for (const v of ["how-plots", "account", "welcome", "plant", "glossary", "about", ""]) {
      assert.equal(guideFor(v), null, `${v} should have no guide`);
    }
  });

  it("goes back from a guide to its page, and only from a guide", () => {
    assert.equal(pageOf("how-crops"), "crops");
    assert.equal(pageOf("crops"), null);
    assert.equal(pageOf("how-account"), null);
    assert.equal(pageOf("how-"), null);
  });
});

describe("the guides render for everyone", () => {
  // The same shape as the public-view test: each guide must be dispatched
  // once for a stranger and once behind the gate, or it 404s for one of them.
  it("every guide is dispatched in both branches of App", async () => {
    const { readFile } = await import("node:fs/promises");
    const app = await readFile("src/App.tsx", "utf8");
    for (const k of GUIDE_KEYS) {
      const hits = app.match(new RegExp(`view === "${k}"`, "g")) ?? [];
      assert.ok(hits.length >= 2, `"${k}" is dispatched ${hits.length} time(s)`);
    }
  });

  it("the top bar offers the (?) on every guided page", async () => {
    const { readFile } = await import("node:fs/promises");
    const shell = await readFile("src/components/AppShell.tsx", "utf8");
    assert.match(shell, /<GuideButton/, "the shell has no (?) control");
  });
});

describe("the Plants guide gives Companions a group of its own", () => {
  // The feature was one step under "Change", read by nobody; the owner asked
  // for it to be shown. The guide names the control by the row's own glyph,
  // so a reader can find it, and the glyph is the one the ledger draws.
  it("names the group, its two kinds and the row's glyph", async () => {
    const { readFile } = await import("node:fs/promises");
    const guide = await readFile("src/views/howto/crops.tsx", "utf8");
    const ledger = await readFile("src/components/CropLedger.tsx", "utf8");
    assert.match(guide, /heading: "Companions"/);
    assert.match(guide, /<Glyph path=\{ICON\.companions\} \/> on a row/);
    assert.match(guide, /"🤝 Synergy"/);
    assert.match(guide, /"🎨 Design"/);
    assert.match(ledger, /<Glyph path=\{ICON\.companions\} \/>/);
  });
});
