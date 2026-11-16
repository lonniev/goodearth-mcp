// The one FieldData station a plot reads its conditions from. Good Earth reaches
// FieldData as any client does, so a first use takes one Nostr reply. One button
// moves it along, and it always says what is happening.

import { useEffect, useRef, useState } from "react";
import {
  fielddataConnect, fielddataConnectFinish, fielddataStations, plotStation,
  type PlotStationRow,
} from "../lib/mcp";
import { forgetStation } from "../lib/pageLoads";
import { tour } from "../lib/tour/targets";
import StationMap from "./StationMap";
import { Tx } from "@tollbooth-dpyc/web/react";
import { useT, WORDS } from "../i18n";
import { Pill, StatusChip } from "./ui";

type Step =
  | { kind: "rest" }
  | { kind: "busy"; words: string }
  | { kind: "reply"; phrase: string; relay: string }
  | { kind: "choose"; stations: PlotStationRow[] };

const NOT_CONNECTED = /connect your fielddata/i;

/// FieldData needs this patron's one Nostr reply before it answers for them.
export const needsConnect = (message: string) => NOT_CONNECTED.test(message);

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
  const [onMap, setOnMap] = useState(false);
  const t = useT();

  useEffect(() => {
    plotStation(block).then((r) => setCurrent(r.station)).catch((e: Error) => setProblem(e.message));
  }, [block]);

  async function sendMessage() {
    setStep({ kind: "busy", words: t("ui.plotStation.sending") });
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
    setStep({ kind: "busy", words: t("ui.plotStation.asking") });
    try {
      setStep({ kind: "choose", stations: await fielddataStations() });
    } catch (e) {
      if (!NOT_CONNECTED.test((e as Error).message)) throw e;
      await sendMessage();
    }
  });

  const replied = (back: Step & { kind: "reply" }) => run(back, async () => {
    setStep({ kind: "busy", words: t("ui.plotStation.looking") });
    await fielddataConnectFinish(back.phrase);
    setDone(t("ui.plotStation.connected"));
    setStep({ kind: "busy", words: t("ui.plotStation.asking") });
    setStep({ kind: "choose", stations: await fielddataStations() });
  });

  const openedOnce = useRef(false);
  useEffect(() => {
    if (!opened || openedOnce.current) return;
    openedOnce.current = true;
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const pick = (back: Step, id: string, name: string, choice = "") => run(back, async () => {
    setStep({ kind: "busy", words: t("ui.plotStation.saving") });
    setCurrent((await plotStation(block, id, name, choice)).station);
    forgetStation(block);
    setOnMap(false);
    setStep({ kind: "rest" });
    setDone(t("ui.plotStation.saved"));
    onChosen?.();
  });

  return (
    <div className="mt-3" {...tour("plots.station")}>
      <p className="text-[0.6875rem] text-ink-soft">{t("ui.plotStation.station")}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.78125rem]">
        {step.kind !== "choose" && <span>{current ? current.name : t("ui.plotStation.none")}</span>}
        {step.kind === "rest" && (
          <Pill onClick={() => void begin()}>{current ? t("ui.plotStation.change") : t("ui.plotStation.choose")}</Pill>
        )}
        {step.kind === "busy" && (
          <span role="status" className="animate-pulse text-ink-soft motion-reduce:animate-none">{step.words}</span>
        )}
        {step.kind === "choose" && (
          <>
            <select
              aria-label={t("ui.plotStation.station")}
              value={current?.station_id ?? ""}
              onChange={(e) => void pick(step, e.target.value, step.stations.find((s) => s.station_id === e.target.value)?.name ?? "")}
              className="min-h-11 rounded border border-rule bg-panel px-2 text-[1rem]"
            >
              <option value="">{t("ui.plotStation.none")}</option>
              {step.stations.map((s) => <option key={s.station_id} value={s.station_id}>{s.name}</option>)}
            </select>
            <Pill active={onMap} onClick={() => setOnMap((v) => !v)}>{t("ui.plotStation.findOnMap")}</Pill>
            <Pill onClick={() => { setOnMap(false); setStep({ kind: "rest" }); onKeep?.(); }}>{t("ui.plotStation.keep")}</Pill>
          </>
        )}
        {done && step.kind !== "busy" && <StatusChip tone="reached">✓ {done}</StatusChip>}
      </div>
      {step.kind === "choose" && onMap && (
        <StationMap block={block} currentId={current?.station_id ?? ""}
          onPick={(s) => void pick(step, s.station_id, s.name, s.choice)} />
      )}
      {step.kind === "reply" && (
        <div className="mt-1.5 rounded-md bg-band p-2.5 text-[0.78125rem]">
          <p><Tx ns={WORDS} k="ui.plotStation.sent" components={{ phrase: <b className="data">{step.phrase}</b> }} /></p>
          <p className="mt-0.5">{t("ui.plotStation.replyThenTap")}</p>
          {step.relay && <p className="data mt-1 text-[0.65625rem] text-ink-soft">{t("ui.plotStation.replyOn", { relay: step.relay })}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill active onClick={() => void replied(step)}>{t("ui.plotStation.replied")}</Pill>
            <Pill onClick={() => void run(step, sendMessage)}>{t("ui.plotStation.sendNew")}</Pill>
            <Pill onClick={() => { setProblem(""); setStep({ kind: "rest" }); }}>{t("ui.plotStation.cancel")}</Pill>
          </div>
        </div>
      )}
      {problem && (
        <div role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-clay">
          <span>{problem}</span>
          {needsConnect(problem) && step.kind === "rest" && (
            <Pill active onClick={() => void run({ kind: "rest" }, sendMessage)}>{t("ui.plotStation.connect")}</Pill>
          )}
        </div>
      )}
    </div>
  );
}
