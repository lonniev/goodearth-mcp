// Groups of plots, on the Plots page, as folders around the plot chips.
//
// The folders are `FolderTree`'s; this adds each folder's menu. It holds Show
// and Hide, which act on every plot below it, a new group inside it, Edit
// plots and Rename; the edits save the plots whose groups change, in one
// batched save. A group is a path on each plot
// (see `lib/plotGroups`).

import { useState, type ReactNode } from "react";
import { CELL, Glyph, ICON, RowActions } from "./ui";
import FolderTree from "./FolderTree";
import {
  cleanPath, hideGroup, isWithin, leaf, memberIds, moveOpen,
  renameGroup, reveal, showGroup, ungrouped, withGroup,
} from "../lib/plotGroups";
import { readOpenGroups, writeOpenGroups } from "../lib/openGroups";
import { saveBlocks } from "../lib/saveBlock";
import { EXAMPLE_ID, type SavedRegion } from "../lib/regions";
import { tour } from "../lib/tour/targets";

type Sheet =
  | { kind: "ask"; group: string }
  | { kind: "members"; group: string; fresh: boolean }
  | { kind: "rename"; group: string };

const PILL = "flex min-h-11 items-center gap-1.5 rounded-full border border-rule px-3.5 text-[12.5px] font-medium active:bg-band";

export default function PlotFolders({ plots, hidden, onHidden, onSaved, synced, chip, actions }: {
  plots: SavedRegion[];
  hidden: string[];
  onHidden: (ids: string[]) => void;
  /// The plots a save changed, as the record stored them.
  onSaved: (saved: SavedRegion[]) => void;
  /// Saving waits for the record, which knows each plot's groups.
  synced: boolean;
  chip: (plot: SavedRegion) => ReactNode;
  /// What acts on the plot being worked, at the top row's end.
  actions: ReactNode;
}) {
  const own = plots.filter((p) => p.id !== EXAMPLE_ID);
  const [open, setOpenState] = useState<string[]>(readOpenGroups);
  const setOpen = (next: string[]) => setOpenState(writeOpenGroups(next));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const loose = ungrouped(plots);

  function sheets(group: string): ReactNode {
    if (!sheet || sheet.group !== group) return null;
    if (sheet.kind === "ask") {
      return (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-rule bg-panel px-3.5 py-2">
          <button className={PILL} onClick={() => { onHidden(showGroup(hidden, own, group)); setSheet(null); }}>
            <Glyph path={ICON.eye} size={16} /> Show
          </button>
          <button className={PILL} onClick={() => { onHidden(hideGroup(hidden, own, group)); setSheet(null); }}>
            <Glyph path={ICON.eyeOff} size={16} /> Hide
          </button>
          {synced && (
            <>
              <button className={PILL} onClick={() => setSheet({ kind: "members", group, fresh: true })}
                aria-label={`New group inside ${leaf(group)}`}>
                <Glyph path={ICON.add} size={16} /> Group
              </button>
              <button className={PILL} onClick={() => setSheet({ kind: "members", group, fresh: false })}>
                <Glyph path={ICON.group} size={16} /> Edit plots
              </button>
              <button className={PILL} onClick={() => setSheet({ kind: "rename", group })}>
                <Glyph path={ICON.edit} size={16} /> Rename
              </button>
            </>
          )}
          <button onClick={() => setSheet(null)} aria-label="Close"
            className="ml-auto inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft">×</button>
        </div>
      );
    }
    if (sheet.kind === "members") {
      return (
        <Members plots={own} group={group} fresh={sheet.fresh}
          onDone={(saved, path) => {
            setSheet(null);
            if (!saved.length) return;
            onSaved(saved);
            setOpen(reveal(open, path));
          }} />
      );
    }
    return (
      <Rename plots={own} group={group}
        onDone={(saved, to) => {
          setSheet(null);
          if (!saved.length || !to) return;
          onSaved(saved);
          setOpen(moveOpen(open, group, to));
        }} />
    );
  }

  return (
    <div {...tour("plots.chips")}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {synced && own.length > 0 && (
          <button onClick={() => setSheet(sheet?.group === "" ? null : { kind: "members", group: "", fresh: true })}
            aria-label="New group" title="Group plots"
            className="flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-rule bg-panel px-3 text-[13px] font-medium text-ink-soft active:bg-band">
            <Glyph path={ICON.add} size={16} /> Group
          </button>
        )}
        {actions}
      </div>
      {sheets("")}
      <div {...tour("plots.groups")}>
        <FolderTree plots={own} open={open} onOpen={setOpen} plot={chip}
          faint={(g) => { const ids = memberIds(own, g); return ids.length > 0 && ids.every((id) => hidden.includes(id)); }}
          under={sheets}
          extra={(g) => (
            <button onClick={() => setSheet(sheet?.group === g ? null : { kind: "ask", group: g })}
              aria-expanded={sheet?.group === g} aria-label={`${leaf(g)}: show, hide or edit`}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${
                sheet?.group === g ? "bg-ink text-paper" : "text-ink-soft active:bg-band"}`}>
              <Glyph path={ICON.more} size={18} />
            </button>
          )} />
      </div>
      {loose.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-2">{loose.map(chip)}</div>
      )}
    </div>
  );
}

/// Which plots are in a group: a checklist, saved as one batch. A new group
/// is named here too, inside the group the page is narrowed to.
function Members({ plots, group, fresh, onDone }: {
  plots: SavedRegion[];
  group: string;
  fresh: boolean;
  onDone: (saved: SavedRegion[], group: string) => void;
}) {
  const [name, setName] = useState("");
  const path = fresh ? cleanPath(group ? `${group} / ${name}` : name) : group;
  const [picked, setPicked] = useState<string[]>(() => fresh ? [] : memberIds(plots, group));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function commit() {
    if (!path) { setErr(fresh ? "A group needs a name." : "A group is at most six levels deep."); return; }
    const changed = plots.flatMap((p) => {
      const was = (p.groups ?? []).some((g) => isWithin(g, path));
      const now = picked.includes(p.id);
      return was === now ? [] : [{ ...p, groups: withGroup(p.groups ?? [], path, now) }];
    });
    if (!changed.length) { onDone([], path); return; }
    setSaving(true); setErr("");
    try {
      onDone(await saveBlocks(changed), path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-2 rounded-md border border-rule bg-panel p-3.5">
      <div className="flex items-center gap-1">
        {fresh ? (
          <label className="flex-1 text-[11px] text-ink-soft">
            {group ? `New group inside ${leaf(group)}` : "New group"}
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") onDone([], ""); }}
              placeholder="Orchard" className={`mt-0.5 min-h-11 ${CELL}`} />
          </label>
        ) : (
          <p className="flex-1 text-[13px] font-semibold">{leaf(group)}</p>
        )}
        <div className="self-end">
          <RowActions onCommit={() => void commit()} onCancel={() => onDone([], "")} saving={saving} what={leaf(path) || "group"} />
        </div>
      </div>
      <ul className="mt-2 divide-y divide-rule">
        {plots.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-11 items-center gap-2.5 text-[13px]">
              <input type="checkbox" className="h-4 w-4 accent-growth" checked={picked.includes(p.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
              {p.name}
            </label>
          </li>
        ))}
      </ul>
      <p className="data mt-1.5 text-[10.5px] text-ink-soft">
        A slash puts a group inside another: North Farm / Orchard.
      </p>
      {err && <p className="mt-1.5 text-[12.5px] text-clay">{err}</p>}
    </div>
  );
}

/// Rename a group, or move it by typing another path: everything inside moves with it.
function Rename({ plots, group, onDone }: {
  plots: SavedRegion[];
  group: string;
  onDone: (saved: SavedRegion[], to: string) => void;
}) {
  const [to, setTo] = useState(group);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function commit() {
    const path = cleanPath(to);
    if (!path) { setErr("A group needs a name, at most six levels deep."); return; }
    setSaving(true); setErr("");
    try {
      const changed = renameGroup(plots, group, path);
      onDone(changed.length ? await saveBlocks(changed) : [], path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-2 rounded-md border border-rule bg-panel p-3.5">
      <div className="flex items-center gap-1">
        <label className="flex-1 text-[11px] text-ink-soft">
          Group
          <input autoFocus value={to} onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") onDone([], ""); }}
            className={`mt-0.5 min-h-11 ${CELL}`} />
        </label>
        <div className="self-end">
          <RowActions onCommit={() => void commit()} onCancel={() => onDone([], "")} saving={saving} what={leaf(group)} />
        </div>
      </div>
      <p className="data mt-1.5 text-[10.5px] text-ink-soft">
        Type another path to move it, with every group and plot inside: South Farm / Orchard.
      </p>
      {err && <p className="mt-1.5 text-[12.5px] text-clay">{err}</p>}
    </div>
  );
}
