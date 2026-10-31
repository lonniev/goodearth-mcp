// The one FieldData station a plot reads its conditions from. Good Earth reaches
// FieldData as any client does, so a first use takes one Nostr reply. One button
// moves it along, and it always says what is happening.

import { useEffect, useRef, useState } from "react";
import {
  fielddataConnect, fielddataConnectFinish, fielddataStations, plotStation,
  type PlotStationRow,
} from "../lib/mcp";
import { tour } from "../lib/tour/targets";
import { Pill, StatusChip } from "./ui";

type Step =
  | { kind: "rest" }
  | { kind: "busy"; words: string }
  | { kind: "reply"; phrase: string; relay: string }
  | { kind: "choose"; stations: PlotStationRow[] };

const NOT_CONNECTED = /connect your fielddata/i;

export default function PlotStation({ block, opened = false, onChosen, onKeep }: {
  block: string;
  /// Start at the chooser, for a shortcut that already said "change".
  opened?: boolean;
  onChosen?: () => void;
  onKeep?: () => void;
}) {
  const [current, setCurrent] = useState<PlotStationRow | null>(null);
  const [step, setStep] = useState<Step>({ kind: "rest" });
  const [done, setDone] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    plotStation(block).then((r) => setCurrent(r.station)).catch((e: Error) => setProblem(e.message));
  }, [block]);

  async function sendMessage() {
    setStep({ kind: "busy", words: "Sending your Nostr message…" });
    const { phrase, relay } = await fielddataConnect();
    setStep({ kind: "reply", phrase, relay });
  }

  async function run(back: Step, work: () => Promise<void>) {
    setProblem("");
    setDone("");
    try {
      await work();
    } catch (e) {
      setStep(back);
      setProblem((e as Error).message);
    }
  }

  const begin = () => run({ kind: "rest" }, async () => {
    setStep({ kind: "busy", words: "Asking FieldData for your stations…" });
    try {
      setStep({ kind: "choose", stations: await fielddataStations() });
    } catch (e) {
      if (!NOT_CONNECTED.test((e as Error).message)) throw e;
      await sendMessage();
    }
  });

  const replied = (back: Step & { kind: "reply" }) => run(back, async () => {
    setStep({ kind: "busy", words: "Looking for your reply…" });
    await fielddataConnectFinish(back.phrase);
    setDone("Connected");
    setStep({ kind: "busy", words: "Asking FieldData for your stations…" });
    setStep({ kind: "choose", stations: await fielddataStations() });
  });

  const openedOnce = useRef(false);
  useEffect(() => {
    if (!opened || openedOnce.current) return;
    openedOnce.current = true;
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const pick = (back: Step, id: string, name: string) => run(back, async () => {
    setStep({ kind: "busy", words: "Saving…" });
    setCurrent((await plotStation(block, id, name)).station);
    setStep({ kind: "rest" });
    setDone("Saved");
    onChosen?.();
  });

  return (
    <div className="mt-3" {...tour("plots.station")}>
      <p className="text-[11px] text-ink-soft">Station</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
        {step.kind !== "choose" && <span>{current ? current.name : "None"}</span>}
        {step.kind === "rest" && (
          <Pill onClick={() => void begin()}>{current ? "Change" : "Choose from FieldData"}</Pill>
        )}
        {step.kind === "busy" && (
          <span role="status" className="animate-pulse text-ink-soft motion-reduce:animate-none">{step.words}</span>
        )}
        {step.kind === "choose" && (
          <>
            <select
              aria-label="Station"
              value={current?.station_id ?? ""}
              onChange={(e) => void pick(step, e.target.value, e.target.selectedOptions[0]?.text ?? "")}
              className="min-h-11 rounded border border-rule bg-panel px-2 text-[16px]"
            >
              <option value="">None</option>
              {step.stations.map((s) => <option key={s.station_id} value={s.station_id}>{s.name}</option>)}
            </select>
            <Pill onClick={() => { setStep({ kind: "rest" }); onKeep?.(); }}>Keep this</Pill>
          </>
        )}
        {done && step.kind !== "busy" && <StatusChip tone="reached">✓ {done}</StatusChip>}
      </div>
      {step.kind === "reply" && (
        <div className="mt-1.5 rounded-md bg-band p-2.5 text-[12.5px]">
          <p>FieldData sent you a Nostr message marked <b className="data">{step.phrase}</b>.</p>
          <p className="mt-0.5">Reply to it, then tap below.</p>
          {step.relay && <p className="data mt-1 text-[10.5px] text-ink-soft">Reply on {step.relay}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill active onClick={() => void replied(step)}>I replied</Pill>
            <Pill onClick={() => void run(step, sendMessage)}>Send a new message</Pill>
            <Pill onClick={() => { setProblem(""); setStep({ kind: "rest" }); }}>Cancel</Pill>
          </div>
        </div>
      )}
      {problem && <p role="alert" className="mt-1 text-[12px] text-clay">{problem}</p>}
    </div>
  );
}
