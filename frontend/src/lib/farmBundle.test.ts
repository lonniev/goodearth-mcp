import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUNDLE_FORMAT, bundleFileName, chunks, cleanItem, countLine, importName,
  makeBundle, readBundle, validGeometry, type FarmBundle,
} from "./farmBundle.ts";
import type { ItemRow, TaskRow } from "./mcp.ts";
import type { SavedRegion } from "./regions.ts";

const PLOT: SavedRegion = {
  id: "map-abc", name: "North Field", baseTempF: 45, aliases: ["the top acre"],
  region: { type: "Polygon", coordinates: [[[-73.2, 44.4], [-73.1, 44.4], [-73.1, 44.5], [-73.2, 44.4]]] },
} as SavedRegion;

const row = (over: Record<string, unknown>): ItemRow => ({
  item_id: "i-1", kind: "planting", season_year: 2026, observed_on: null,
  source: null, retired: false, ...over,
}) as ItemRow;

const TASK = {
  id: "t-1", title: "Cover the east beds", note: null, due: "2026-09-20",
  starts_at: null, ends_at: null, reminder_only: true, done: false,
  created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-02T10:00:00Z",
} as unknown as TaskRow;

const made = () => makeBundle(PLOT, {
  planting: [row({ crop: "Zinnia", gdd_target: 900, set_out: "2026-05-20" })],
  pest: [row({ item_id: "i-2", kind: "pest", pest: "Botrytis", model: "botrytis" })],
}, [TASK], new Date("2026-09-12T12:00:00Z"));

describe("what a bundle carries out", () => {
  it("keeps the grower's content and drops the record's bookkeeping", () => {
    const b = made();
    assert.deepEqual(b.items.planting, [{ crop: "Zinnia", gdd_target: 900, set_out: "2026-05-20" }]);
    assert.deepEqual(b.items.pest, [{ pest: "Botrytis", model: "botrytis" }]);
    assert.deepEqual(b.items.wildlife, []);
  });

  it("carries no id at all — the record upserts on them", () => {
    const text = JSON.stringify(made());
    assert.equal(text.includes("item_id"), false);
    assert.equal(text.includes('"id"'), false, "a task id would upsert over the sharer's task");
  });

  it("carries every task, done or not, with only its own fields", () => {
    assert.deepEqual(made().tasks, [
      { title: "Cover the east beds", due: "2026-09-20", reminder_only: true, done: false },
    ]);
  });

  it("names no patron and leaves the sharer's nicknames behind", () => {
    const text = JSON.stringify(made());
    assert.equal(/npub/.test(text), false);
    assert.equal(text.includes("the top acre"), false);
  });

  it("says what it is", () => {
    const b = made();
    assert.equal(b.format, BUNDLE_FORMAT);
    assert.equal(b.plot.name, "North Field");
    assert.equal(b.plot.base_temp_f, 45);
  });
});

describe("reading a bundle someone else made", () => {
  it("round-trips", () => {
    const r = readBundle(JSON.stringify(made()));
    assert.ok("bundle" in r);
    assert.deepEqual(r.bundle.items, made().items);
    assert.deepEqual(r.skipped, []);
  });

  it("strips an id a hand-edited file slipped back in", () => {
    const b = made() as FarmBundle;
    (b.items.planting[0] as Record<string, unknown>).item_id = "someone-elses-row";
    const r = readBundle(JSON.stringify(b));
    assert.ok("bundle" in r);
    assert.equal("item_id" in r.bundle.items.planting[0], false);
  });

  it("leaves out kinds it does not import, and says which", () => {
    const b = { ...made(), items: { ...made().items, observation: [{ note: "saw a fox" }] } };
    const r = readBundle(JSON.stringify(b));
    assert.ok("bundle" in r);
    assert.deepEqual(r.skipped, ["observation"]);
  });

  it("refuses what is not a bundle", () => {
    for (const text of ["not json", "[]", JSON.stringify({ format: "other" })]) {
      assert.ok("error" in readBundle(text), text);
    }
  });

  it("refuses a bundle from a newer version", () => {
    assert.match((readBundle(JSON.stringify({ ...made(), version: 99 })) as { error: string }).error, /newer/);
  });

  it("refuses a plot with no name or an outline it cannot read", () => {
    const b = made();
    assert.ok("error" in readBundle(JSON.stringify({ ...b, plot: { ...b.plot, name: "  " } })));
    assert.ok("error" in readBundle(JSON.stringify({ ...b, plot: { ...b.plot, geometry: { type: "Polygon", coordinates: [[[0, 0]]] } } })));
    assert.ok("error" in readBundle(JSON.stringify({ ...b, plot: { ...b.plot, geometry: { lat: 200, lon: 0, radius_m: 10 } } })));
  });

  it("refuses an item list that is not a list of objects", () => {
    const b = made();
    assert.ok("error" in readBundle(JSON.stringify({ ...b, items: { planting: "zinnia" } })));
    assert.ok("error" in readBundle(JSON.stringify({ ...b, items: { planting: [1, 2] } })));
  });

  it("puts an impossible base temperature back to 50 °F", () => {
    const b = made();
    const r = readBundle(JSON.stringify({ ...b, plot: { ...b.plot, base_temp_f: 780 } }));
    assert.ok("bundle" in r);
    assert.equal(r.bundle.plot.base_temp_f, 50);
  });

  it("reads a large farm whole — size is asked about, never refused", () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ crop: `Bed ${i}`, gdd_target: 900 }));
    const r = readBundle(JSON.stringify({ ...made(), items: { ...made().items, planting: many } }));
    assert.ok("bundle" in r);
    assert.equal(r.bundle.items.planting.length, 3000);
  });

  it("strips a task id a hand-edited file slipped back in", () => {
    const b = { ...made(), tasks: [{ id: "someone-elses-task", title: "Mulch" }] };
    const r = readBundle(JSON.stringify(b));
    assert.ok("bundle" in r);
    assert.deepEqual(r.bundle.tasks, [{ title: "Mulch" }]);
  });

  it("refuses a task with no title, and a task list that is not a list", () => {
    assert.match((readBundle(JSON.stringify({ ...made(), tasks: [{ note: "x" }] })) as { error: string }).error, /no title/);
    assert.ok("error" in readBundle(JSON.stringify({ ...made(), tasks: "mulch" })));
  });

  it("reads a bundle with no tasks section as one with no tasks", () => {
    const { tasks: _t, ...noTasks } = made();
    const r = readBundle(JSON.stringify(noTasks));
    assert.ok("bundle" in r);
    assert.deepEqual(r.bundle.tasks, []);
  });

  it("does not let a key named __proto__ through", () => {
    const polluted = cleanItem(JSON.parse('{"crop":"Zinnia","__proto__":{"admin":true}}'));
    assert.deepEqual(Object.keys(polluted), ["crop"]);
    assert.equal(({} as Record<string, unknown>).admin, undefined);
  });
});

describe("the outline", () => {
  it("takes a pin or a closed polygon", () => {
    assert.ok(validGeometry({ lat: 44.4, lon: -73.2, radius_m: 400 }));
    assert.ok(validGeometry(PLOT.region));
    assert.equal(validGeometry({ lat: 44.4, lon: -73.2, radius_m: 90_000 }), false);
  });
});

describe("the new plot's name", () => {
  it("is the bundle's own when it is free", () => {
    assert.equal(importName("North Field", ["South Field"]), "North Field");
  });

  it("steps aside from a plot the importer already has", () => {
    assert.equal(importName("North Field", ["north  field"]), "North Field (shared)");
    assert.equal(importName("North Field", ["North Field", "North Field (shared)"]), "North Field (shared 2)");
  });
});

describe("the rest", () => {
  it("writes a hundred at a time, and every one of them", () => {
    const parts = chunks(Array.from({ length: 250 }, (_, i) => i), 100);
    assert.deepEqual(parts.map((p) => p.length), [100, 100, 50]);
  });

  it("names the file after the plot", () => {
    assert.equal(bundleFileName("North Field (east parcel)"), "north-field-east-parcel.goodearth.json");
    assert.equal(bundleFileName("!!!"), "plot.goodearth.json");
    assert.equal(bundleFileName("Côte Field"), "cote-field.goodearth.json");
  });

  it("counts what is inside", () => {
    assert.equal(countLine(made()), "1 planting · 1 pest · 1 task");
    assert.equal(countLine({ ...made(), items: { planting: [], pest: [], wildlife: [] }, tasks: [] }), "nothing tracked yet");
  });
});
