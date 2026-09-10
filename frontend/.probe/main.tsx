import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SeasonChart from "../src/components/SeasonChart";
import { ChartFrame } from "../src/components/ui";
import { UnitProvider } from "../src/components/Units";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UnitProvider value="imperial">
      <div style={{ padding: 12 }}>
        <ChartFrame label="The season's heat">
          <SeasonChart data={data} flags={flags} showGround={false} />
        </ChartFrame>
      </div>
    </UnitProvider>
  </StrictMode>,
);
