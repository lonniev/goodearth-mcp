// The tours against the pages they walk.
//
// A tour step names a control; if nothing draws that name the step is a
// blank. It abbreviates a guide step; if the guide no longer has it the two
// have drifted. And it speaks in a voice the owner set: what a thing is,
// briefly, with no clause about what it is not.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TOURS } from "./copy.ts";
import { TARGETS } from "./targets.ts";
import { TOUR_PAGES } from "./types.ts";

const SRC = new URL("../..", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return f.endsWith(".tsx") ? [p] : [];
  });
}
const ALL_TSX = sources(SRC).map((p) => readFileSync(p, "utf8")).join("\n");

/// The control labels of a guide's `using` steps, read from its source: the
/// guides are JSX, which the test runner does not load.
function guideControls(page: string): string[] {
  const src = readFileSync(join(SRC, "views", "howto", `${page}.tsx`), "utf8");
  return [...src.matchAll(/^\s+\["([^"]+)",\s*$/gm)].map((m) => m[1]);
}

const GUIDED = ["plots", "ledger", "almanac", "crops", "pests", "wildlife", "todo", "reports"];

describe("every page has its tour", () => {
  it("one per page named in TOUR_PAGES, and the page says so", () => {
    for (const p of TOUR_PAGES) {
      assert.ok(TOURS[p], `${p} has no tour`);
      assert.equal(TOURS[p].page, p);
      assert.ok(TOURS[p].steps.length >= 3, `${p} has too few steps`);
    }
  });
  it("every guided page's tour ends at the (?)", () => {
    for (const p of GUIDED) {
      const last = TOURS[p as keyof typeof TOURS].steps.at(-1);
      assert.equal(last?.target, "shell.guide", `${p}'s last step is ${String(last?.target)}`);
    }
  });
  it("every page's tour is asked for by that page's source", () => {
    const where: Record<string, string> = {
      welcome: "views/Welcome.tsx", signin: "App.tsx", ledger: "views/HeatLedger.tsx", plots: "views/Plots.tsx",
      crops: "views/Crops.tsx", pests: "views/Pests.tsx", wildlife: "views/Wildlife.tsx", todo: "views/Todo.tsx",
      reports: "views/FieldReports.tsx", almanac: "views/Almanac.tsx", account: "components/Preferences.tsx",
    };
    for (const [page, file] of Object.entries(where)) {
      const src = readFileSync(join(SRC, file), "utf8");
      assert.match(src, new RegExp(`useTour\\("${page}"`), `${file} does not ask for the ${page} tour`);
    }
  });
});

describe("every step points at something drawn", () => {
  const named = new Set<string>();
  for (const t of Object.values(TOURS)) for (const s of t.steps) if (typeof s.target === "string") named.add(s.target);

  it("each named target is in the registry", () => {
    for (const n of named) assert.ok((TARGETS as readonly string[]).includes(n), `${n} is not a registered target`);
  });
  it("each registered target is written into some page", () => {
    for (const n of TARGETS) {
      assert.ok(ALL_TSX.includes(`"${n}"`), `no page carries data-tour "${n}"`);
    }
  });
  it("each registered target is pointed at by some step", () => {
    for (const n of TARGETS) assert.ok(named.has(n), `${n} is registered but no step points at it`);
  });
  it("a page action a step asks for is one the page registers", () => {
    const registered: Record<string, string> = {
      plots: "views/Plots.tsx", reports: "views/FieldReports.tsx", todo: "views/Todo.tsx",
    };
    for (const t of Object.values(TOURS)) for (const s of t.steps) {
      if (!s.before) continue;
      const file = registered[t.page];
      assert.ok(file, `${t.page} asks for "${s.before}" but registers no actions`);
      const src = readFileSync(join(SRC, file), "utf8");
      assert.ok(src.includes(`"${s.before}"`), `${file} does not register "${s.before}"`);
    }
  });
});

describe("each step abbreviates a guide step that still exists", () => {
  for (const p of GUIDED) {
    it(`${p}`, () => {
      const controls = guideControls(p);
      assert.ok(controls.length > 3, `${p}'s guide reads as empty`);
      for (const s of TOURS[p as keyof typeof TOURS].steps) {
        if (!s.guide) continue;
        assert.ok(controls.includes(s.guide[1]), `${p}: the guide has no step "${s.guide[1]}"`);
      }
    });
  }
});

describe("the copy says what a thing is", () => {
  const CONTRAST = /\b(not|no|never|nothing|instead of|rather than)\b/i;
  for (const t of Object.values(TOURS)) {
    it(`${t.page}: short, and free of contrast`, () => {
      for (const s of t.steps) {
        assert.ok(s.says.length <= 180, `${t.page} "${s.title}" runs ${s.says.length} characters`);
        assert.ok(s.title.length <= 28, `${t.page} title "${s.title}" is long`);
        assert.ok(s.says.split(/[.!?](\s|$)/).filter((x) => x.trim()).length <= 2, `${t.page} "${s.title}" is more than two sentences`);
        assert.doesNotMatch(s.says, CONTRAST, `${t.page} "${s.title}" says what something is not: ${s.says}`);
        assert.doesNotMatch(s.title, CONTRAST, `${t.page} title "${s.title}"`);
      }
    });
  }
});
