// Soil window — when the ground is ready, not when the air is.
//
// Soil lags air by weeks and is the steadier signal, which is why it decides a
// planting date where a warm afternoon does not. Shows the near-term reading
// and the typical crossing together: "plant this week?" and "how long have I
// got?" are different questions.

import { useUnits } from "./Units";
import type { SoilWindowResult } from "../lib/mcp";

const d = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function SoilCard({ data }: { data: SoilWindowResult }) {
  const u = useUnits();
  const t = data.typical;
  const out = data.days_to_typical_crossing;
  const near = data.near_term;

  return (
    <div className="mb-3 rounded-md border border-rule bg-panel px-4 py-3.5">
      <h3 className="figure text-[15.5px] font-semibold">
        Soil {data.direction === "cooling" ? "cooling through" : "warming through"}{" "}
        {u.showTemp(data.threshold_f)}
      </h3>

      <p className="mt-1.5 text-[13px] leading-relaxed">
        {data.current_soil_f != null ? (
          <>Soil at planting depth is <b>{u.showTemp(data.current_soil_f)}</b> right now. </>
        ) : null}
        {near?.crossing_date ? (
          <>It crosses <b>{d(near.crossing_date)}</b> — inside the forecast, so that date is a
            reading rather than a projection.</>
        ) : (
          <>{near?.note}</>
        )}
      </p>

      {t && (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Normally around <b className="text-ink">{d(t.median)}</b> here — between {d(t.earliest)} and{" "}
          {d(t.latest)} across {t.years_on_record} seasons.
          {out != null && out > 0 && <> About {out} days out.</>}
          {out != null && out <= 0 && <> That window has already opened.</>}
        </p>
      )}

      <p className="data mt-2 text-[10px] text-ink-soft">{data.band.label}</p>
    </div>
  );
}
