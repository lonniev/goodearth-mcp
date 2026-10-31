// The one FieldData station a plot reads its conditions from. Good Earth reaches
// FieldData as any client does, so a first use takes one Nostr reply.

import { useEffect, useState } from "react";
import {
  fielddataConnect, fielddataConnectFinish, fielddataStations, plotStation,
  type PlotStationRow,
} from "../lib/mcp";

type Exchange = { phrase: string; relay: string };

export default function PlotStation({ block }: { block: string }) {
  const [current, setCurrent] = useState<PlotStationRow | null>(null);
  const [stations, setStations] = useState<PlotStationRow[] | null>(null);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    plotStation(block).then((r) => setCurrent(r.station)).catch((e: Error) => setProblem(e.message));
  }, [block]);

  async function attempt(step: () => Promise<void>) {
    setBusy(true);
    setProblem("");
    try {
      await step();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const choose = () => attempt(async () => {
    try {
      setStations(await fielddataStations());
      setNeedsConnect(false);
    } catch (e) {
      if (!/connect your fielddata/i.test((e as Error).message)) throw e;
      setNeedsConnect(true);
    }
  });

  const connect = () => attempt(async () => setExchange(await fielddataConnect()));

  const replied = () => attempt(async () => {
    await fielddataConnectFinish(exchange!.phrase);
    setExchange(null);
    setNeedsConnect(false);
    setStations(await fielddataStations());
  });

  const pick = (id: string) => attempt(async () => {
    const found = stations?.find((s) => s.station_id === id);
    setCurrent((await plotStation(block, id, found?.name ?? "")).station);
    setStations(null);
  });

  return (
    <div className="mt-3">
      <p className="text-[11px] text-ink-soft">Station</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span>{current ? current.name : "None"}</span>
        {!stations && !needsConnect && !exchange && (
          <button type="button" disabled={busy} onClick={() => void choose()}
            className="min-h-9 rounded-full border border-rule px-3 text-[12px]">
            {current ? "Change" : "Choose from FieldData"}
          </button>
        )}
        {needsConnect && !exchange && (
          <button type="button" disabled={busy} onClick={() => void connect()}
            className="min-h-9 rounded-full border border-rule px-3 text-[12px]">
            Connect FieldData
          </button>
        )}
        {stations && (
          <select aria-label="Station" disabled={busy} value={current?.station_id ?? ""}
            onChange={(e) => void pick(e.target.value)} className="min-h-9 rounded border border-rule bg-panel px-2">
            <option value="">None</option>
            {stations.map((s) => <option key={s.station_id} value={s.station_id}>{s.name}</option>)}
          </select>
        )}
      </div>
      {exchange && (
        <div className="mt-1.5 rounded-md bg-band p-2.5 text-[12.5px]">
          <p>Check your Nostr messages for one marked <b className="data">{exchange.phrase}</b>, and reply to it.</p>
          {exchange.relay && <p className="data mt-1 text-[10.5px] text-ink-soft">Reply on {exchange.relay}</p>}
          <button type="button" disabled={busy} onClick={() => void replied()}
            className="mt-1.5 min-h-9 rounded-full border border-rule px-3 text-[12px]">I replied</button>
        </div>
      )}
      {problem && <p className="mt-1 text-[12px] text-clay">{problem}</p>}
    </div>
  );
}
