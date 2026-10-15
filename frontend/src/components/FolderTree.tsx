// Plot groups as folders: the one tree My Plots and the top bar's picker both
// draw. A folder opens to the groups inside it and the plots filed in it; a
// plot in several groups sits in each of their folders. Which folders are
// open is the caller's (see `lib/openGroups`); how a plot is drawn is too.

import type { ReactNode } from "react";
import { Glyph, ICON } from "./ui";
import { childrenOf, filedIn, isOpen, leaf, memberIds, toggleOpen } from "../lib/plotGroups";
import type { SavedRegion } from "../lib/regions";

export type FolderTreeProps = {
  /// The plots the groups are read from.
  plots: SavedRegion[];
  open: string[];
  onOpen: (open: string[]) => void;
  /// One plot, as the caller draws it.
  plot: (plot: SavedRegion) => ReactNode;
  /// Plots one under another, for a list; otherwise side by side, as chips.
  stacked?: boolean;
  /// A folder drawn faint, such as one whose plots are all hidden.
  faint?: (group: string) => boolean;
  /// More on a folder's row, at its end.
  extra?: (group: string) => ReactNode;
  /// What opens under a folder's row, such as its menu.
  under?: (group: string) => ReactNode;
};

export default function FolderTree(props: FolderTreeProps) {
  const top = childrenOf(props.plots, "");
  if (!top.length) return null;
  return (
    <ul role="tree" aria-label="Groups">
      {top.map((g) => <Folder key={g} path={g} {...props} />)}
    </ul>
  );
}

function Folder({ path, ...t }: FolderTreeProps & { path: string }) {
  const opened = isOpen(t.open, path);
  const kids = childrenOf(t.plots, path);
  const filed = filedIn(t.plots, path);
  return (
    <li role="treeitem" aria-expanded={opened} aria-label={leaf(path)}>
      <div className="flex items-center">
        <button onClick={() => t.onOpen(toggleOpen(t.open, path))}
          title={opened ? `Close ${leaf(path)}` : `Open ${leaf(path)}`}
          className={`flex min-h-11 flex-1 items-center gap-1.5 pr-2 text-left font-semibold ${
            t.stacked ? "text-[13px]" : "text-[14px]"} ${t.faint?.(path) ? "text-ink-soft opacity-60" : "text-ink"}`}>
          <span className={`text-ink-soft transition-transform ${opened ? "" : "-rotate-90"}`}>
            <Glyph path={ICON.chevron} size={18} />
          </span>
          <Glyph path={opened ? ICON.groupOpen : ICON.group} size={18} />
          <span className="truncate">{leaf(path)}</span>
          <span className="data text-[10.5px] font-normal text-ink-soft">{memberIds(t.plots, path).length}</span>
        </button>
        {t.extra?.(path)}
      </div>
      {t.under?.(path)}
      {opened && (
        <div className="ml-[8px] border-l border-rule pl-3">
          {kids.length > 0 && (
            <ul role="group">{kids.map((g) => <Folder key={g} {...t} path={g} />)}</ul>
          )}
          {filed.length > 0 && (
            t.stacked
              ? <ul role="group">{filed.map((p) => <li key={p.id}>{t.plot(p)}</li>)}</ul>
              : <div className="flex flex-wrap items-center gap-2 pb-2 pt-0.5">{filed.map(t.plot)}</div>
          )}
        </div>
      )}
    </li>
  );
}
