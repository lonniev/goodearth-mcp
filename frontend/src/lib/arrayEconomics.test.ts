import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateSync } from "node:zlib";
import {
  arrayKwhPerKw, capacityKw, cellsUnder, clampSize, dailyIncomeUsd, dailyKwh, DEFAULT_ARRAY, footprintBounds,
  installUsd, M_PER_DEG_LAT, periodLabel, sellRate, sizeFromCorner, tierFor,
} from "./arrayEconomics.ts";
import { lonScaleAt } from "./geo.ts";
import type { SunlightKwPrices } from "./mcp.ts";
import { decodeGrid, type WireField, type WireGrid, type WirePacked } from "./sunGrid.ts";

// The same 2×3 raster the grid tests use: three kept cells, one row of two
// off the block, 2 m cells.
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
function wire(withKwh = true): WireGrid {
  const N = 255;
  const month = u8([80, 40, N, 10, 70, N], 0.1);
  return {
    rows: 2, cols: 3, cell_m: 2, cells: 4,
    bounds: { min_lat: 44.0, min_lon: -72.0, max_lat: 44.0002, max_lon: -71.9997 },
    fields: {
      hours_by_month: Array.from({ length: 12 }, () => month),
      ...(withKwh ? { kwh_per_kwp_year: u16([1100, 600, 65535, 300, 1000, 65535]), solar_access_pct: u8([95, 50, N, 25, 88, N]) } : {}),
      horizon_terrain_deg: packed(new Array(4 * 72).fill(5), [4, 72]),
      horizon_canopy_deg: packed(new Array(4 * 72).fill(20), [4, 72]),
      canopy_kind: packed(new Array(4 * 72).fill(2), [4, 72]),
    },
  };
}

const PRICES: SunlightKwPrices = {
  place: { country_code: "us", state_id: "VT", state_name: "Vermont" },
  sell: { cents_per_kwh: 22.61, sector: "residential", period: "2026-07", state_id: "VT", source: "EIA Electric Power Monthly, Table 5.6.A" },
  install: { residential_usd_per_w: 2.95, commercial_usd_per_w: 1.98, utility_usd_per_w: 1.12, quarter: "2025Q1", basis: "mmp", source: "DOE/NLR PV system cost benchmark" },
  reasons: {},
  array_w_per_m2: 88,
  tiers: { residential_max_kw: 25, commercial_max_kw: 1000 },
  as_of: "2026-10-10T12:00:00+00:00",
};

describe("the footprint in degrees", () => {
  const centre = { lat: 44, lon: -72 };
  it("is centred, with longitude scaled by the latitude", () => {
    const b = footprintBounds(centre, { w: 24, l: 12 });
    assert.ok(Math.abs((b.north - b.south) * M_PER_DEG_LAT - 12) < 1e-6);
    assert.ok(Math.abs(((b.east - b.west) * M_PER_DEG_LAT) / lonScaleAt(44) - 24) < 1e-6);
    assert.ok(Math.abs((b.north + b.south) / 2 - 44) < 1e-12);
  });
  it("a dragged corner gives the size back, and the limits hold", () => {
    const b = footprintBounds(centre, { w: 24, l: 12 });
    assert.deepEqual(sizeFromCorner(centre, { lat: b.south, lon: b.east }), { w: 24, l: 12 });
    assert.deepEqual(sizeFromCorner(centre, { lat: b.north, lon: b.west }), { w: 24, l: 12 });
    assert.deepEqual(sizeFromCorner(centre, { lat: 44, lon: -72 }), { w: 4, l: 4 });
    assert.deepEqual(sizeFromCorner(centre, { lat: 45, lon: -70 }), { w: 400, l: 400 });
  });
  it("clamps and rounds a typed size", () => {
    assert.deepEqual(clampSize({ w: 1, l: 1000 }), { w: 4, l: 400 });
    assert.deepEqual(clampSize({ w: 24.4, l: Number.NaN }), { w: 24, l: 4 });
    assert.deepEqual(clampSize(DEFAULT_ARRAY), DEFAULT_ARRAY);
  });
});

describe("the cells under the footprint", () => {
  it("finds the kept cells and skips the ones off the block", async () => {
    const g = await decodeGrid(wire());
    const all = { south: 43.9, west: -72.1, north: 44.1, east: -71.9 };
    assert.deepEqual(cellsUnder(g, all), [0, 1, 2, 3]);
    const tiny = { south: 44.00004, west: -71.99986, north: 44.00006, east: -71.99984 }; // around cell 3's centre
    assert.deepEqual(cellsUnder(g, tiny), [3]);
    assert.deepEqual(cellsUnder(g, { south: 45, west: -72, north: 46, east: -71 }), []);
  });
  it("yields the mean over them, the spot alone when none, null without a solar figure", async () => {
    const g = await decodeGrid(wire());
    const all = { south: 43.9, west: -72.1, north: 44.1, east: -71.9 };
    assert.equal(arrayKwhPerKw(g, all, false, 0), (1100 + 600 + 300 + 1000) / 4);
    assert.equal(arrayKwhPerKw(g, { south: 45, west: -72, north: 46, east: -71 }, false, 2), 300);
    assert.equal(arrayKwhPerKw(await decodeGrid(wire(false)), all, false, 0), null);
  });
});

describe("what the array costs and earns", () => {
  it("turns metres into kW at the answer's density", () => {
    assert.ok(Math.abs(capacityKw({ w: 24, l: 12 }, 88) - 25.344) < 1e-9);
  });
  it("prices by the benchmark row for its size", () => {
    assert.equal(tierFor(25, PRICES.tiers), "residential");
    assert.equal(tierFor(25.3, PRICES.tiers), "commercial");
    assert.equal(tierFor(1000, PRICES.tiers), "commercial");
    assert.equal(tierFor(1000.5, PRICES.tiers), "utility");
    assert.ok(Math.abs(installUsd(10, PRICES)! - 29_500) < 1e-6);
    assert.ok(Math.abs(installUsd(100, PRICES)! - 198_000) < 1e-6);
    assert.ok(Math.abs(installUsd(5000, PRICES)! - 5_600_000) < 1e-6);
    assert.equal(installUsd(10, { ...PRICES, install: null }), null);
  });
  it("makes a day's kWh and sells it", () => {
    const made = dailyKwh(25.344, 1212);
    assert.ok(Math.abs(made - 84.15) < 0.01);
    assert.ok(Math.abs(dailyIncomeUsd(made, 22.61) - 19.03) < 0.01);
  });
  it("takes the grower's own rate before the read one, and says whose it is", () => {
    assert.deepEqual(sellRate(PRICES, null), { cents: 22.61, label: "EIA Vermont, Jul 2026", yours: false });
    assert.deepEqual(sellRate(PRICES, 15), { cents: 15, label: "yours", yours: true });
    assert.equal(sellRate({ ...PRICES, sell: null }, null), null);
    assert.deepEqual(sellRate({ ...PRICES, sell: null }, 9.5), { cents: 9.5, label: "yours", yours: true });
    assert.deepEqual(sellRate(null, 12), { cents: 12, label: "yours", yours: true });
    assert.equal(sellRate(null, null), null);
  });
  it("names the month a tariff is for", () => {
    assert.equal(periodLabel("2026-07"), "Jul 2026");
    assert.equal(periodLabel("2025Q1"), "2025Q1");
  });
});
