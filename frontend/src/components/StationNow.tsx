// "Now at <station>": what a plot's chosen FieldData station reports, above the
// charts. It asks once on arrival; a plot with no station shows nothing at all.

import { useEffect, useState } from "react";
import { getStoredNpub } from "@tollbooth-dpyc/web";
import { plotConditions, plotStation, type PlotConditions } from "../lib/mcp";
import { readingLine, reportAge } from "../lib/stationNow";
import { useUnits } from "./Units";

export default function StationNow({ block }: { block: string }) {
  const u = useUnits();
  const [report, setReport] = useState<PlotConditions | null>(null);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let live = true;
    setReport(null);
    setName("");
    setProblem("");
    // A guest has no plots of their own to have chosen a station for.
    if (!getStoredNpub()) return;
    (async () => {
      const { station } = await plotStation(block);
      if (!live || !station) return;
      setName(station.name);
      const answer = await plotConditions(block);
      if (live) setReport(answer);
    })().catch((e: Error) => { if (live) setProblem(e.message); });
    return () => { live = false; };
  }, [block]);

  if (!name) return null;
  return (
    <section className="mb-4 rounded-md border border-rule bg-panel px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="figure text-[15px] font-semibold">🌡️ Now at {name}</h2>
        {report?.observed_at && (
          <span className="data text-[10.5px] text-ink-soft">{reportAge(report.observed_at, Date.now())}</span>
        )}
      </div>
      {problem && <p className="mt-1 text-[12.5px] text-clay">{problem}</p>}
      {!report && !problem && <p className="mt-1 text-[12.5px] text-ink-soft" aria-busy="true">Reading the station…</p>}
      {report && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {report.readings.map((r) => {
            const line = readingLine(r, u.unit);
            return (
              <div key={`${r.sensor_kind}-${r.channel}`}>
                <dt className="text-[11px] text-ink-soft">{line.label}</dt>
                <dd className="figure text-[15px]">{line.value}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
