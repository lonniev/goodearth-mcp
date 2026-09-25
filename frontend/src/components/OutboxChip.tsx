// What is waiting for signal — in the header, so a grower who recorded a cut
// in the far field can see it has not gone yet, and see it go.
//
// It is also what sends it: when the signal comes back, when the app is looked
// at again, and every half minute while anything waits. Nothing shows when
// nothing waits.

import { useEffect, useState } from "react";
import { discard, entries, subscribe, type Pending } from "../lib/outbox";
import { getStoredNpub } from "@tollbooth-dpyc/web";
import { flushOutbox } from "../lib/mcp";

const KIND: Record<string, [string, string]> = {
  planting: ["planting", "plantings"],
  pest: ["pest", "pests"],
  wildlife: ["wildlife entry", "wildlife entries"],
  observation: ["field note", "field notes"],
};

function describe(p: Pending): string {
  const a = p.args;
  if (p.tool === "task_save") return `Task: ${String(a.title ?? "")}`;
  if (p.tool === "task_set_done") return a.done ? "A task ticked done" : "A task unticked";
  if (p.tool === "task_delete") return "A task removed";
  const [one, many] = KIND[String(a.kind)] ?? ["entry", "entries"];
  const saved = (a.items as unknown[] | undefined)?.length ?? 0;
  const gone = (a.retire_ids as unknown[] | undefined)?.length ?? 0;
  if (gone && !saved) return `${gone} ${gone === 1 ? one : many} removed`;
  return `${saved} ${saved === 1 ? one : many}`;
}

const at = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function OutboxChip() {
  const [list, setList] = useState<Pending[]>(() => entries());
  const [open, setOpen] = useState(false);
  useEffect(() => subscribe(setList), []);

  const npub = getStoredNpub();
  const mine = list.filter((p) => p.npub === npub);
  const waitingN = mine.filter((p) => !p.refused).length;
  const refusedN = mine.length - waitingN;

  useEffect(() => {
    if (!waitingN) return;
    const go = () => { if (navigator.onLine !== false) void flushOutbox(); };
    go();
    window.addEventListener("online", go);
    document.addEventListener("visibilitychange", go);
    const t = window.setInterval(go, 30_000);
    return () => {
      window.removeEventListener("online", go);
      document.removeEventListener("visibilitychange", go);
      window.clearInterval(t);
    };
  }, [waitingN]);

  useEffect(() => { if (!mine.length) setOpen(false); }, [mine.length]);
  if (!mine.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Recorded without signal. It is sent when the signal is back."
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-honey px-3 text-[12px] text-ink active:bg-band"
      >
        {waitingN > 0 && (
          <span>⇡ {waitingN}<span className="hidden sm:inline"> waiting for signal</span></span>
        )}
        {refusedN > 0 && <span className="text-clay">{refusedN} not saved</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-rule bg-panel p-3 text-[12.5px] shadow-lg">
          <p className="mb-2 text-ink-soft">
            Recorded here without signal. Each one is sent, in order, when the
            signal is back.
          </p>
          <ul className="space-y-1.5">
            {mine.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2">
                <span>
                  {describe(p)}
                  <span className="text-ink-soft"> · {at(p.queuedAt)}</span>
                  {p.refused && <span className="block text-clay">Not saved: {p.refused}</span>}
                </span>
                {p.refused && (
                  <button onClick={() => discard(p.id)}
                    className="shrink-0 rounded border border-rule px-2 py-0.5 text-[11.5px] active:bg-band">
                    Discard
                  </button>
                )}
              </li>
            ))}
          </ul>
          {waitingN > 0 && (
            <button onClick={() => void flushOutbox()}
              className="mt-3 min-h-9 w-full rounded-md bg-ink px-3 text-[12.5px] text-paper">
              Send now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
