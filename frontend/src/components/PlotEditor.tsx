// Rename a plot, and set the other names it answers to.
//
// An alias is only needed for a name that shares no words with the saved one:
// "North Farm" already finds "North Farm (east parcel)". The hint says so,
// because a grower who does not know that will fill the list with fragments.

import { useState } from "react";
import { CELL, ICON, IconButton, RowActions } from "./ui";
import { cleanAliases, withAlias } from "../lib/aliases";
import { saveBlock } from "../lib/saveBlock";
import type { SavedRegion } from "../lib/regions";

export default function PlotEditor({ plot, onDone }: {
  plot: SavedRegion;
  /// The saved plot, or null when the grower cancelled.
  onDone: (saved: SavedRegion | null) => void;
}) {
  const [name, setName] = useState(plot.name);
  const [aliases, setAliases] = useState<string[]>(plot.aliases ?? []);
  const [entry, setEntry] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function add() {
    setAliases(withAlias(aliases, entry, name));
    setEntry("");
  }

  async function commit() {
    const n = name.trim();
    if (!n) { setErr("A plot needs a name."); return; }
    // A name typed but not yet added is one the grower meant to keep.
    const final = cleanAliases(entry.trim() ? [...aliases, entry] : aliases, n);
    setSaving(true); setErr("");
    try {
      onDone(await saveBlock({ ...plot, name: n, aliases: final }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const keys = (e: React.KeyboardEvent, enter: () => void) => {
    if (e.key === "Enter") { e.preventDefault(); enter(); }
    if (e.key === "Escape") onDone(null);
  };

  return (
    <div>
      <div className="flex items-center gap-1">
        <label className="flex-1 text-[11px] text-ink-soft">
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => keys(e, () => void commit())}
            className={`mt-0.5 min-h-11 ${CELL}`} />
        </label>
        <div className="self-end">
          <RowActions onCommit={() => void commit()} onCancel={() => onDone(null)} saving={saving} what={name || "plot"} />
        </div>
      </div>

      <p className="mt-2.5 text-[11px] text-ink-soft">Also called</p>
      {aliases.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {aliases.map((a) => (
            <li key={a} className="flex items-center rounded-full bg-band pl-3 text-[12.5px]">
              {a}
              <button onClick={() => setAliases(aliases.filter((x) => x !== a))}
                aria-label={`Remove ${a}`}
                className="inline-flex h-9 w-9 items-center justify-center text-ink-soft active:text-clay">×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <input value={entry} onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => keys(e, add)}
          placeholder="Another name for it"
          className={`min-h-11 flex-1 ${CELL}`} />
        <IconButton path={ICON.add} label="Add name" tone="quiet" hideLabel onClick={add} disabled={!entry.trim()} />
      </div>
      <p className="data mt-1.5 text-[10.5px] text-ink-soft">
        Any part of the name already works. Add one only for a name that shares no words with it.
      </p>
      {err && <p className="mt-1.5 text-[12.5px] text-clay">{err}</p>}
    </div>
  );
}
