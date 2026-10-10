// Every working page gives the share button one table, and the text and
// JSON that leave the app say what the page said.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  almanacSheet, cropsSheet, ledgerSheet, pestsSheet, plotsSheet, referencesSheet, reportsSheet,
  sheetJSON, sheetText, termsSheet, todoSheet, wildlifeSheet, type Sheet,
} from "./exports.ts";
import { GLOSSARY, GROUPS, searchGlossary } from "./glossary.ts";
import { GUIDED } from "./guides.ts";
import type { AlmanacResult, Measure } from "./mcp.ts";
import type { SavedRegion } from "./regions.ts";
import { showDD, showTemp } from "./units.ts";

const src = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const meadow: SavedRegion = {
  id: "blk_1", name: "Lower Meadow", baseTempF: 50, aliases: ["Meadow"],
  region: { type: "Polygon", coordinates: [[[-73.25, 44.16], [-73.24, 44.16], [-73.24, 44.17], [-73.25, 44.17], [-73.25, 44.16]]] },
};
const pin: SavedRegion = {
  id: "blk_2", name: "Bench", baseTempF: 45, region: { lat: 44.2, lon: -73.3, radius_m: 100 },
};

describe("sheetText — the table as it leaves the app", () => {
  const sheet: Sheet = {
    title: "Tasks", emoji: "✅", eyebrow: "Lower Meadow · 2 tasks",
    head: ["Done", "Task"], rows: [["✓", "Mow the | lane"], ["", "Net the cherries\nbefore the birds"]],
    foot: "Measurements only.", json: { tasks: [] },
  };

  it("is a Markdown table under its heading, with the foot last", () => {
    const t = sheetText(sheet).split("\n");
    assert.equal(t[0], "✅ Tasks — Lower Meadow · 2 tasks");
    assert.equal(t[2], "| Done | Task |");
    assert.equal(t[3], "|---|---|");
    assert.equal(t.at(-1), "Measurements only.");
  });

  it("keeps a pipe or a line break inside a cell from breaking the row", () => {
    const t = sheetText(sheet).split("\n");
    assert.equal(t[4], "| ✓ | Mow the ∣ lane |");
    assert.equal(t[5], "|  | Net the cherries before the birds |");
  });

  it("copies the records as indented JSON", () => {
    assert.equal(sheetJSON(sheet), '{\n  "tasks": []\n}');
  });
});

describe("plotsSheet", () => {
  it("names each plot with its shape, area, base and where it sits", () => {
    const s = plotsSheet([meadow, pin], "F");
    assert.equal(s.eyebrow, "2 plots");
    assert.equal(s.rows[0][0], "Lower Meadow");
    assert.equal(s.rows[0][1], "Meadow");
    assert.equal(s.rows[0][2], "drawn");
    assert.match(String(s.rows[0][3]), /acres/);
    assert.equal(s.rows[0][4], showTemp(50, "F"));
    assert.equal(s.rows[0][5], "44.16500");
    assert.equal(s.rows[1][2], "pin · 100 m");
    assert.equal(s.rows[1][4], showTemp(45, "F"));
  });

  it("reads the base in the scale the reader asked for", () => {
    assert.equal(plotsSheet([meadow], "C").rows[0][4], showTemp(50, "C"));
  });

  it("carries the geometry in the JSON, which the agent needs and the table does not", () => {
    const j = s(plotsSheet([pin], "F")) as { region: unknown; id: string }[];
    assert.deepEqual(j[0].region, pin.region);
    assert.equal(j[0].id, "blk_2");
  });
});

describe("ledgerSheet — one row per reading", () => {
  it("rows only what has been read", () => {
    const empty = ledgerSheet({ region: meadow, heat: null, frost: null, soil: null, drying: null, disease: null }, "F");
    assert.equal(empty.rows.length, 0);
    const some = ledgerSheet({
      region: meadow, soil: null, drying: null, disease: null,
      heat: {
        success: true, base_temp_f: 50, season_start: "2026-03-01", as_of: "2026-10-10",
        accumulated_gdd: { min: 2100, mean: 2200, max: 2300, spread: 200, n: 9 },
        normals: { span_years: 10, band: [], today: null, ahead_of_normal_gdd: 120, note: "" },
      } as never,
      frost: {
        success: true, as_of: "2026-10-10",
        first_frost: { median: "2026-10-04", earliest: "2026-09-20", latest: "2026-10-20", years_on_record: 10, note: "" },
        days_to_median_first_frost: -6, nights: [],
        worst_night: { date: "2026-10-12", level: "frost_likely", low_ground_f: 30, reason: "clear and still" },
      } as never,
    }, "F");
    assert.deepEqual(some.rows.map((r) => r[0]), [
      "Heat since 2026-03-01", "Against normal", "First frost, typically",
      "Days to typical first frost", "Coldest night ahead",
    ]);
    assert.equal(some.rows[0][1], showDD(2200, "F"));
    assert.equal(some.rows[1][1], `+${showDD(120, "F")}`);
    assert.equal(some.rows[4][1], `${showTemp(30, "F")} on 2026-10-12`);
    assert.match(String(some.rows[4][2]), /^frost likely/);
  });
});

describe("almanacSheet", () => {
  const measure = (m: Partial<Measure>): Measure => ({
    unit: "°F", actual: [], forecast: [], normal: null, accumulates: false, ...m,
  });
  const data = {
    success: true, as_of: "2026-09-03", season_start: "2026-04-01",
    dates: Array.from({ length: 20 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`),
    forecast_dates: Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`),
    measures: {
      temp_max: measure({ forecast: Array(10).fill(78), normal: Array(30).fill({ min: 65, mean: 70, max: 75 }) }),
    },
    normals_span_years: 10,
  } as unknown as AlmanacResult;

  it("is the outlook: each measure, its normal, and the departure in words", () => {
    const s = almanacSheet(data, "Frogdale Farm", "F");
    assert.equal(s.eyebrow, "Frogdale Farm · next 10 days against the last 10 seasons");
    assert.deepEqual(s.rows[0], ["Daily high", "78 °F", "70 °F", "above normal by 8 °F"]);
    assert.match(s.foot ?? "", /No recommendation is implied/);
  });
});

describe("cropsSheet", () => {
  it("puts where each planting stands beside what the grower saved", () => {
    const s = cropsSheet(meadow, [
      { id: "p1", crop: "Zinnia", setOut: "2026-05-20", sownOn: "2026-04-20", gddTarget: 1200, regionId: "blk_1" },
      { id: "p2", crop: "Apple", setOut: "2020-04-01", perennial: true, regionId: "blk_1", baseTempF: 43 },
    ], {
      success: true, as_of: "2026-10-10", plantings: [
        { ref: "p1", crop: "Zinnia", set_out: "2026-05-20", gdd_target: 1200, gdd_accumulated: 900, gdd_remaining: 300,
          projected_date: "2026-10-20", state: "on_pace", note: "",
          finish: { verdict: "wont_finish", projected_date: "2026-10-20", note: "" } },
      ],
    } as never, "F");
    assert.equal(s.eyebrow, "Lower Meadow · 2 plantings");
    assert.deepEqual(s.rows[0], ["Zinnia", "2026-04-20", "2026-05-20", showTemp(50, "F"), showDD(1200, "F"), showDD(900, "F"), showDD(300, "F"), "wont finish · 2026-10-20"]);
    assert.equal(s.rows[1][3], showTemp(43, "F"));
    assert.equal(s.rows[1][7], "perennial");
  });
});

describe("pestsSheet, wildlifeSheet, todoSheet, reportsSheet", () => {
  it("pests: a watch-only row says so instead of inventing a base", () => {
    const s = pestsSheet(meadow, [
      { id: "m1", regionId: "blk_1", pest: "Codling moth", base_temp: 50, biofix: "2026-05-01", stages: [{ stage: "egg hatch", gdd: 250 }] },
      { id: "m2", regionId: "blk_1", pest: "Voles", watch: true, stages: [] },
    ], {
      success: true, as_of: "2026-10-10", scout_now: [], summary: "", note: "",
      pests: [{ ref: "m1", pest: "Codling moth", gdd_accumulated: 1400, current_stage: "second flight",
        next_stage: { stage: "egg hatch", gdd: 1500, reached: false, gdd_remaining: 100, projected_date: "2026-10-14" }, state: "active", note: "" }],
    }, "F");
    assert.deepEqual(s.rows[0], ["Codling moth", showTemp(50, "F"), "2026-05-01", showDD(1400, "F"), "second flight", `egg hatch at ${showDD(1500, "F")}`, "2026-10-14"]);
    assert.equal(s.rows[1][1], "watch");
  });

  it("wildlife: an interval event reports its window, not a day", () => {
    const s = wildlifeSheet(meadow, [
      { id: "w1", regionId: "blk_1", species: "Ewe", event: "lambing", driver: "interval", days: 147, from: "2025-11-01", emoji: "🐑" },
    ], {
      success: true, as_of: "2026-10-10", due_soon: [], summary: "", note: "",
      events: [{ ref: "w1", species: "Ewe", event: "lambing", emoji: "🐑", note: null, driver: "interval",
        threshold: "147 days from 2025-11-01", reached_on: null, projected_date: "2026-03-28",
        window: { from: "2026-03-24", to: "2026-04-01" } }],
    });
    assert.deepEqual(s.rows[0], ["🐑 Ewe", "lambing", "interval", "147 days from 2025-11-01", "", "2026-03-24 to 2026-04-01"]);
    assert.equal(s.eyebrow, "Lower Meadow · 1 watch");
  });

  it("tasks: done is a tick, the rest blank", () => {
    const s = todoSheet(meadow, [
      { id: "t1", title: "Mow", done: true, due: "2026-10-11", reminder_only: false },
      { id: "t2", title: "Net", done: false, reminder_only: true, note: "before the birds" },
    ]);
    assert.deepEqual(s.rows, [["✓", "2026-10-11", "", "Mow", ""], ["", "", "", "Net", "before the birds"]]);
    assert.equal(s.eyebrow, "Lower Meadow · 2 tasks");
  });

  it("a page of a longer record says so", () => {
    const rows = [{ id: "t1", title: "Mow", done: false, reminder_only: false }];
    assert.equal(todoSheet(meadow, rows, 57).eyebrow, "Lower Meadow · 1 of 57 tasks");
    assert.equal(todoSheet(meadow, rows, 1).eyebrow, "Lower Meadow · 1 task");
  });

  it("reports: the kind by its label, the amount with its unit, the spot to five places", () => {
    const s = reportsSheet(meadow, [
      { id: "r1", regionId: "blk_1", tag: "harvest", observedOn: "2026-09-02", note: "first cut", crop: "Zinnia",
        amount: 40, unit: "stems", lat: 44.1612345, lng: -73.2498765, createdAt: "2026-09-02T12:00:00Z" },
      { id: "r2", regionId: "blk_1", tag: "frost", observedOn: "2026-10-04", note: "", createdAt: "2026-10-04T12:00:00Z" },
    ]);
    assert.deepEqual(s.rows[0], ["2026-09-02", "Harvest", "Zinnia", "40 stems", "first cut", "44.16123, -73.24988"]);
    assert.deepEqual(s.rows[1], ["2026-10-04", "Frost", "", "", "", ""]);
  });
});

describe("referencesSheet and termsSheet — the free reading", () => {
  it("lists sources, models and further reading as one table, kind first", () => {
    const s = referencesSheet(
      [{ name: "Daymet", url: "https://daymet.ornl.gov/", role: "the normal band", resolution: "1 km", note: "history only" }],
      [{ title: "Growing degree days", body: "mean above base", assumption: "a cold night does not un-grow" }],
      [{ name: "NEWA", url: "https://newa.cornell.edu/", said: "station data" }],
    );
    assert.equal(s.eyebrow, "1 source · 1 model · 1 place to read on");
    assert.deepEqual(s.rows, [
      ["Source", "Daymet", "the normal band", "history only", "1 km", "https://daymet.ornl.gov/"],
      ["Model", "Growing degree days", "mean above base", "a cold night does not un-grow", "", ""],
      ["Reading", "NEWA", "station data", "", "", "https://newa.cornell.edu/"],
    ]);
  });

  it("the words: every entry, grouped by where it is met, or the search's hits", () => {
    const all = termsSheet(GLOSSARY, GROUPS, GLOSSARY.length);
    assert.equal(all.rows.length, GLOSSARY.length);
    assert.equal(all.eyebrow, `${GLOSSARY.length} words`);
    const gdd = all.rows.find((r) => r[0] === "Growing degree day")!;
    assert.equal(gdd[1], "GDD, degree day");
    assert.equal(gdd[2], "Counting heat");
    const hits = searchGlossary("biofix");
    assert.equal(termsSheet(hits, GROUPS, GLOSSARY.length).eyebrow, `${hits.length} of ${GLOSSARY.length} words`);
  });
});

describe("the share button", () => {
  it("is on the guest top bar too, for the words and the sources", () => {
    assert.match(src("components/GuestShell.tsx"), /<ShareButton/);
    assert.match(src("views/References.tsx"), /useShare\(/);
    assert.match(src("views/Glossary.tsx"), /useShare\(/);
  });

  it("stands beside the (?) in the top bar", () => {
    const shell = src("components/AppShell.tsx");
    const guide = shell.indexOf("<GuideButton");
    const share = shell.indexOf("<ShareButton");
    const full = shell.indexOf("<FullscreenButton");
    assert.ok(guide > 0 && share > guide && full > share, "the order is (?) · share · full screen");
  });

  it("is given a sheet by every guided page", () => {
    const file: Record<(typeof GUIDED)[number], string> = {
      plots: "Plots", ledger: "HeatLedger", almanac: "Almanac", crops: "Crops",
      pests: "Pests", wildlife: "Wildlife", todo: "Todo", reports: "FieldReports",
    };
    for (const p of GUIDED) {
      assert.match(src(`views/${file[p]}.tsx`), /useShare\(/, `${file[p]} publishes nothing`);
    }
  });
});

/// The JSON a sheet carries, parsed back — what an agent would read.
function s(sheet: Sheet): unknown {
  return JSON.parse(sheetJSON(sheet));
}
