import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SeasonChart from "../src/components/SeasonChart";
import { ChartFrame } from "../src/components/ui";
import { UnitProvider } from "../src/components/Units";
import FrostCard from "../src/components/FrostCard";
import SoilCard from "../src/components/SoilCard";
import "./probe.css";

const N = 253;
const iso = (d: number) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
const mean = Array.from({ length: N }, (_, i) => Math.round(Math.pow(i / N, 1.8) * 2586));

const data = {
  base_temp_f: 50, season_start: "2026-01-01",
  curve: { dates: Array.from({ length: N }, (_, i) => iso(i)), cumulative_mean: mean },
  forecast: { cumulative: Array.from({ length: 7 }, (_, i) => 2586 + (i + 1) * 14) },
  projection: { cumulative: Array.from({ length: 60 }, (_, i) => 2684 + (i + 1) * 12), note: "at the recent rate" },
  normals: { span_years: 10, band: mean.map((g) => ({ min: g * 0.9, max: g * 1.1 })) },
  accumulated_gdd: { mean: 2586, min: 2575, max: 2591, spread: 16 },
  region: { sample_count: 14, area_km2: 9.2, grid_spacing_m: 800, bbox: null },
} as never;

const flags = [
  { id: "a", label: "Fall-sow breadseed poppies", index: 246, gdd: 1900, kind: "crops", anchor: "date", begin: iso(246) },
  { id: "b", label: "Chip branches and spread the mulch", index: 248, gdd: 1500, kind: "crops", anchor: "date", begin: iso(248) },
  { id: "c", label: "Domestic chicken laying on eggs", index: 250, gdd: 1200, kind: "wildlife", anchor: "date", begin: iso(250) },
  { id: "d", label: "Grey squirrel nut caching", index: 258, gdd: 800, kind: "wildlife", anchor: "date", begin: iso(258) },
] as never;

// ── The React/Cooling-Trends cards ─────────────────────────────────────
const nights = [64, 55, 52, 63, 49, 44, 60, 51, 46, 46].map((f, i) => ({
  date: iso(252 + i), low_ground_f: f, forecast_low_f: f + 4,
  level: f <= 32 ? "frost_likely" : f <= 38 ? "frost_watch" : "clear",
  reason: "clear and calm", wind_mph: 6, cloud_pct: 20, dew_point_f: f - 6,
}));
const frost = {
  nights, worst_night: nights[5],
  first_frost: { median: "2026-10-13", earliest: "2026-09-19", latest: "2026-11-02", years_on_record: 8 },
  days_to_median_first_frost: 33,
  across_region: { coldest_ground_offset_f: 4.2, terrain_correction: "applied" },
} as never;

const soil = {
  as_of: iso(252), band: { key: "planting", label: "7\u201328 cm (planting depth, ~3\u201311 in)" },
  threshold_f: 60, direction: "cooling", current_soil_f: 68,
  near_term: {
    days: Array.from({ length: 16 }, (_, i) => ({ date: iso(252 + i), soil_f: 68 - i * 0.28 })),
    crossing_date: null,
    note: "The soil does not cross 60 \u00b0F within the 16-day forecast.",
  },
  typical: { median: "2026-09-26", earliest: "2026-09-17", latest: "2026-10-03", years_on_record: 8 },
  days_to_typical_crossing: 16, note: "",
} as never;

// Spring: the soil crosses INSIDE the forecast, and warming rather than cooling.
const soilWarming = {
  ...soil, direction: "warming", current_soil_f: 52, as_of: iso(100),
  near_term: {
    days: Array.from({ length: 16 }, (_, i) => ({ date: iso(100 + i), soil_f: 52 + i * 0.9 })),
    crossing_date: iso(109),
    note: "",
  },
  typical: { median: "2026-04-24", earliest: "2026-04-15", latest: "2026-05-06", years_on_record: 8 },
} as never;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UnitProvider value="imperial">
      <div style={{ padding: 12 }}>
        <ChartFrame label="The season's heat">
          <SeasonChart data={data} flags={flags} showGround={false} />
        </ChartFrame>
        <h2 className="figure mt-6 mb-2.5 text-[18px] font-semibold">🔔 Trends</h2>
        <FrostCard data={frost} />
        <SoilCard data={soil} />
        <SoilCard data={soilWarming} />
      </div>
    </UnitProvider>
  </StrictMode>,
);
