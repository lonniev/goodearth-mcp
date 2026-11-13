// "Now at <station>": what a plot's chosen FieldData station reports, above the
// charts, in the same tiles and marks as today's forecast. It reads through the
// page cache, so a report warmed from the Dashboard is on screen at once;
// a plot with no station shows nothing at all.

import { useEffect, useState, type ReactNode } from "react";
import { getStoredNpub } from "@tollbooth-dpyc/web";
import { type PlotConditions } from "../lib/mcp";
import { loadConditions, loadStation } from "../lib/pageLoads";
import { readingLine, reportAge, tileReadings, windSpeed } from "../lib/stationNow";
import { tour } from "../lib/tour/targets";
import Barometer from "./Barometer";
import PlotStation, { needsConnect } from "./PlotStation";
import { Pill } from "./ui";
import { useUnits } from "./Units";

export function Stat({ emoji, label, value, sub }: {
  emoji: ReactNode; label: string; value: string; sub?: string;
}) {
  return (
    <div className="px-1 text-center">
      <div className="text-[1.625rem] leading-none">{emoji}</div>
      <b className="figure mt-1.5 block text-[1.1875rem] leading-tight">{value}</b>
      <div className="mt-0.5 text-[0.75rem] leading-snug text-ink-soft">{label}</div>
      {sub && <div className="data mt-0.5 text-[0.65625rem] leading-snug text-ink-soft">{sub}</div>}
    </div>
  );
}

export default function StationNow({ block }: { block: string }) {
  const u = useUnits();
  const [report, setReport] = useState<PlotConditions | null>(null);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [changing, setChanging] = useState(false);
  const [chosenCount, setChosenCount] = useState(0);

  useEffect(() => {
    let live = true;
    setReport(null);
    setName("");
    setProblem("");
    // A guest has no plots of their own to have chosen a station for.
    if (!getStoredNpub()) return;
    (async () => {
      const station = await loadStation(block);
      if (!live || !station) return;
      setName(station.name);
      const answer = await loadConditions(block);
      if (live) setReport(answer);
    })().catch((e: Error) => { if (live) setProblem(e.message); });
    return () => { live = false; };
  }, [block, chosenCount]);

  if (!name) return null;
  return (
    <section className="mb-4 rounded-md border border-rule bg-panel px-4 py-3" {...tour("almanac.station")}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="figure text-[0.9375rem] font-semibold">Now at {name}</h2>
        {report?.observed_at && (
          <span className="data text-[0.65625rem] text-ink-soft">{reportAge(report.observed_at, Date.now())}</span>
        )}
        {!changing && <span className="ml-auto"><Pill onClick={() => setChanging(true)}>Change station</Pill></span>}
      </div>
      {changing && (
        <PlotStation block={block} opened
          onChosen={() => { setChanging(false); setChosenCount((n) => n + 1); }}
          onKeep={() => { setChanging(false); if (problem) setChosenCount((n) => n + 1); }} />
      )}
      {problem && !changing && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.78125rem] text-clay">
          <span>{problem}</span>
          {needsConnect(problem) && <Pill active onClick={() => setChanging(true)}>Connect FieldData</Pill>}
        </div>
      )}
      {!report && !problem && <p className="mt-1 text-[0.78125rem] text-ink-soft" aria-busy="true">Reading the station…</p>}
      {report && (
        <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-3.5 sm:grid-cols-4 lg:grid-cols-8">
          {tileReadings(report.readings).map((r) => {
            if (r === "wind") {
              return report.wind && (
                <Stat key="wind" emoji={report.wind.emoji} label="wind" value={windSpeed(report.readings, u.unit)}
                  sub={report.wind.from ? `${report.wind.arrow} from ${report.wind.from}` : undefined} />
              );
            }
            const line = readingLine(r, u.unit);
            return <Stat key={`${r.sensor_kind}-${r.channel}`} emoji={line.emoji === "barometer" ? <Barometer /> : line.emoji} label={line.label} value={line.value} />;
          })}
        </div>
      )}
    </section>
  );
}
