import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import {
  bareSpan, cellAt, cellCentre, classOf, decodeGrid, kwhRamp, paint, ramp, summary,
  type WireField, type WireGrid, type WirePacked,
} from "./sunGrid.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function u8(values: number[], scale = 1, nodata = 255): WireField {
  return { dtype: "uint8", scale, nodata, encoding: "base64", b64: Buffer.from(values).toString("base64") };
}
function u16(values: number[], nodata = 65535): WireField {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => buf.writeUInt16LE(v, i * 2));
  return { dtype: "uint16", scale: 1, nodata, encoding: "base64", b64: buf.toString("base64") };
}
function packed(values: number[], shape: number[]): WirePacked {
  return { dtype: "uint8", shape, encoding: "zlib+base64", b64: deflateSync(Buffer.from(values)).toString("base64") };
}

/// A 2×3 raster whose top-right cell is outside the block: three kept cells, row-major.
function wire(): WireGrid {
  const N = 255;
  // hours in tenths; cells: (0,0)=8 h, (0,1)=4 h, (0,2)=nodata, (1,0)=1 h, (1,1)=7 h, (1,2)=nodata
  const month = (a: number, b: number, c: number, d: number) => u8([a, b, N, c, d, N], 0.1);
  const hours = Array.from({ length: 12 }, () => month(80, 40, 10, 70));
  hours[11] = month(20, 10, 0, 65); // December
  return {
    rows: 2, cols: 3, cell_m: 2, cells: 4,
    bounds: { min_lat: 44.0, min_lon: -72.0, max_lat: 44.0002, max_lon: -71.9997 },
    fields: {
      hours_by_month: hours,
      kwh_per_kwp_year: u16([1100, 600, 65535, 300, 1000, 65535]),
      solar_access_pct: u8([95, 50, N, 25, 88, N]),
      horizon_terrain_deg: packed(new Array(4 * 72).fill(5), [4, 72]),
      horizon_canopy_deg: packed(new Array(4 * 72).fill(20), [4, 72]),
      canopy_kind: packed(new Array(4 * 72).fill(2), [4, 72]),
    },
  };
}

test("decodes the mask, kept order, scales and the zlib'd horizons", async () => {
  const g = await decodeGrid(wire());
  assert.equal(g.n, 4);
  assert.deepEqual(Array.from(g.kept), [0, 1, -1, 2, 3, -1]);
  assert.equal(g.hours[0 * 12 + 5], 8);
  assert.equal(g.hours[3 * 12 + 11], 6.5);
  assert.equal(g.kwh?.[0], 1100);
  assert.equal(g.access?.[2], 25);
  assert.equal(g.terrain.length, 4 * 72);
  assert.equal(g.canopy[100], 20);
  assert.equal(g.kind[0], 2);
  assert.equal(g.hoursInLeaf, g.hours); // no bare months sent → the same reading
});

test("cellAt and cellCentre invert each other, row 0 north", async () => {
  const g = await decodeGrid(wire());
  assert.equal(cellAt(g, 44.00015, -71.99995), 0); // top-left
  assert.equal(cellAt(g, 44.00005, -71.99985), 3); // bottom-middle
  assert.equal(cellAt(g, 44.00015, -71.99975), -1); // top-right is off the block
  assert.equal(cellAt(g, 45, -72), -1);
  const c = cellCentre(g, 3);
  assert.equal(cellAt(g, c.lat, c.lon), 3);
  assert.ok(c.lat < 44.0001 && c.lon > -71.9999);
});

test("classes at the edges and the ramp at its stops", () => {
  assert.equal(classOf(6), "full_sun");
  assert.equal(classOf(5.99), "part_shade");
  assert.equal(classOf(3), "part_shade");
  assert.equal(classOf(2.99), "full_shade");
  assert.deepEqual(ramp(0), [0x27, 0x30, 0x49]);
  assert.deepEqual(ramp(12), [0xff, 0xf1, 0xb5]);
  assert.deepEqual(ramp(20), [0xff, 0xf1, 0xb5]);
  assert.deepEqual(ramp(6), [0xe0, 0x9a, 0x3a]);
  assert.deepEqual(kwhRamp(300), ramp(0));
  assert.deepEqual(kwhRamp(800), ramp(6));
});

test("paint leaves the outside transparent and colours by view", async () => {
  const g = await decodeGrid(wire());
  const px = paint(g, "garden", 5, false);
  assert.equal(px.length, 6 * 4);
  assert.equal(px[2 * 4 + 3], 0); // top-right, off the block
  assert.equal(px[0 * 4 + 3], 255);
  assert.deepEqual(Array.from(px.slice(0, 3)), ramp(8));
  const solar = paint(g, "solar", 5, false);
  assert.deepEqual(Array.from(solar.slice(0, 3)), kwhRamp(1100));
});

test("summary: shares sum to one, full-sun by month, best cell", async () => {
  const g = await decodeGrid(wire());
  const s = summary(g, 5, false);
  assert.deepEqual(s.share, { full_sun: 0.5, part_shade: 0.25, full_shade: 0.25 });
  assert.equal(s.fullSunByMonth[5], 0.5);
  assert.equal(s.fullSunByMonth[11], 0.25);
  assert.equal(s.best, 0);
  assert.equal(s.bestKwh, 1100);
  assert.equal(s.bestAccess, 95);
  assert.equal(s.medianHours, 7);
});

test("the bare-trees chip reads the leaf-off months as a span across the new year", () => {
  assert.equal(bareSpan([1, 2, 3, 4, 10, 11, 12], MONTHS), "Bare trees Oct–Apr");
  assert.equal(bareSpan([11, 12, 1, 2, 3], MONTHS), "Bare trees Nov–Mar");
  assert.equal(bareSpan([], MONTHS), null);
  assert.equal(bareSpan([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], MONTHS), "Bare trees all year");
});
