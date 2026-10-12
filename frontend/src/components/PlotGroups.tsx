// Groups of plots, on the Plots page: a row of group chips above the plot chips.
//
// A group chip opens a small sheet: Show and Hide act on every plot below the
// group, Work on narrows the page to it and steps the row down to the groups
// inside it. Edit plots and Rename save the plots whose groups change, in one
// batched save. A group is a path on each plot (see `lib/plotGroups`).

import { useState } from "react";
import { CELL, Glyph, ICON, RowActions } from "./ui";
import {
  childrenOf, cleanPath, hideGroup, isWithin, leaf, memberIds, parsePath, joinPath,
  renameGroup, showGroup, withGroup,
} from "../lib/plotGroups";
import { saveBlocks } from "../lib/saveBlock";
import { EXAMPLE_ID, type SavedRegion } from "../lib/regions";
import { tour } from "../lib/tour/targets";

type Sheet =
  | { kind: "ask"; group: string }
  | { kind: "members"; group: string; fresh: boolean }
  | { kind: "rename"; group: string };

const CHIP = "flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[13px] font-medium";
const PILL = "flex min-h-11 items-center gap-1.5 rounded-full border border-rule px-3.5 text-[12.5px] font-medium active:bg-band";

export default function PlotGroups({ plots, focus, onFocus, hidden, onHidden, onSaved, synced }: {
  plots: SavedRegion[];
  /// The group the page is narrowed to; "" is every plot.
  focus: string;
  onFocus: (group: string) => void;
  hidden: string[];
  onHidden: (ids: string[]) => void;
  /// The plots a save changed, as the record stored them.
  onSaved: (saved: SavedRegion[]) => void;
  /// Saving waits for the record, which knows each plot's groups.
  synced: boolean;
}) {
  const own = plots.filter((p) => p.id !== EXAMPLE_ID);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const kids = childrenOf(own, focus);
  const trail = parsePath(focus);
  if (own.length < 2 && !kids.length && !focus) return null;

  return (
    <div className="mb-2" {...tour("plots.groups")}>
      <div className="flex flex-wrap items-center gap-2">
        {(focus || kids.length > 0) && (
          <nav aria-label="Groups" className="flex flex-wrap items-center gap-1 text-[12.5px]">
            <button onClick={() => { onFocus(""); setSheet(null); }} aria-current={!focus ? "page" : undefined}
              className={`min-h-11 px-1.5 ${focus ? "text-ink-soft underline" : "font-semibold text-ink"}`}>All</button>
            {trail.map((step, i) => {
              const path = joinPath(trail.slice(0, i + 1));
              const here = i === trail.length - 1;
              return (
                <span key={path} className="flex items-center gap-1">
                  <span className="text-ink-soft" aria-hidden="true">›</span>
                  <button onClick={() => { onFocus(path); setSheet(here ? { kind: "ask", group: path } : null); }}
                    aria-current={here ? "page" : undefined}
                    className={`min-h-11 px-1.5 ${here ? "font-semibold text-ink" : "text-ink-soft underline"}`}>{step}</button>
                </span>
              );
            })}
          </nav>
        )}
        {kids.map((g) => {
          const ids = memberIds(own, g);
          const allHidden = ids.length > 0 && ids.every((id) => hidden.includes(id));
          const open = sheet?.group === g;
          return (
            <button key={g} onClick={() => setSheet(open ? null : { kind: "ask", group: g })}
              aria-expanded={open} title={`${g}: show, hide or work on its plots`}
              className={`${CHIP} ${open ? "border-ink bg-ink text-paper"
                : allHidden ? "border-dashed border-rule bg-panel text-ink-soft opacity-60"
                : "border-rule bg-panel text-ink active:bg-band"}`}>
              <Glyph path={ICON.group} size={16} />
              {leaf(g)}
              <span className={`data text-[10.5px] ${open ? "text-paper/75" : "text-ink-soft"}`}>{ids.length}</span>
            </button>
          );
        })}
        {synced && own.length > 0 && (
          <button onClick={() => setSheet({ kind: "members", group: focus, fresh: true })}
            aria-label={focus ? `New group inside ${leaf(focus)}` : "New group"} title="Group plots"
            className={`${CHIP} border-dashed border-rule bg-panel text-ink-soft active:bg-band`}>
            <Glyph path={ICON.add} size={16} /> Group
          </button>
        )}
      </div>

      {sheet?.kind === "ask" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-rule bg-panel px-3.5 py-2">
          <span className="text-[13px] font-semibold">{leaf(sheet.group)}</span>
          <button className={PILL} onClick={() => { onHidden(showGroup(hidden, own, sheet.group)); setSheet(null); }}>
            <Glyph path={ICON.eye} size={16} /> Show
          </button>
          <button className={PILL} onClick={() => { onHidden(hideGroup(hidden, own, sheet.group)); setSheet(null); }}>
            <Glyph path={ICON.eyeOff} size={16} /> Hide
          </button>
          {sheet.group !== focus && (
            <button className={PILL} onClick={() => { onFocus(sheet.group); setSheet(null); }}>
              <Glyph path={ICON.groupOpen} size={16} /> Work on
            </button>
          )}
          {synced && (
            <>
              <button className={PILL} onClick={() => setSheet({ kind: "members", group: sheet.group, fresh: false })}>
                <Glyph path={ICON.group} size={16} /> Edit plots
              </button>
              <button className={PILL} onClick={() => setSheet({ kind: "rename", group: sheet.group })}>
                <Glyph path={ICON.edit} size={16} /> Rename
              </button>
            </>
          )}
          <button onClick={() => setSheet(null)} aria-label="Close"
            className="ml-auto inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft">×</button>
        </div>
      )}
      {sheet?.kind === "members" && (
        <Members plots={own} group={sheet.group} fresh={sheet.fresh}
          onDone={(saved) => {
            setSheet(null);
            if (saved.length) onSaved(saved);
          }} />
      )}
      {sheet?.kind === "rename" && (
        <Rename plots={own} group={sheet.group}
          onDone={(saved, to) => {
            setSheet(null);
            if (!saved.length || !to) return;
            onSaved(saved);
            // The page stays on the group it was narrowed to, wherever it moved.
            if (focus && isWithin(focus, sheet.group)) {
              onFocus(joinPath([...parsePath(to), ...parsePath(focus).slice(parsePath(sheet.group).length)]));
            }
          }} />
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
    <div className="mt-2 rounded-md border border-rule bg-panel p-3.5">
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
    <div className="mt-2 rounded-md border border-rule bg-panel p-3.5">
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
