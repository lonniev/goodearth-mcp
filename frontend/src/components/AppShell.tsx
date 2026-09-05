// App shell — persistent rail, top bar, and the content well.
//
// The rail carries the full Good Earth surface. Views whose tool has not
// shipped yet are present but dimmed rather than hidden: a grower should be
// able to see where the app is going, and a dimmed row is honest where an
// enabled row that leads to an empty page is not.

import { useEffect, useState, type ReactNode } from "react";
import Avatar from "./Avatar";
import Boundary from "./Boundary";
import RegionPicker from "./RegionPicker";
import type { SavedRegion } from "../lib/regions";
import { applyOrder, move, readCollapsed, readOrder, writeCollapsed, writeOrder } from "../lib/navOrder";

// The view set lives in lib/views so the router can import it without
// reaching into a component. Re-exported here because every view already
// imports ViewKey from the shell.
import type { ViewKey } from "../lib/views";

export { VIEW_KEYS, type ViewKey } from "../lib/views";

interface RailItem {
  key: ViewKey;
  label: string;
  icon: ReactNode;
  ready: boolean;
  /// Shown on hover when the view is not yet available.
  soon?: string;
}

const I = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
    {d}
  </svg>
);

export const RAIL: RailItem[] = [
  { key: "favorites", label: "Favorites", ready: true,
    icon: I(<><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></>) },
  { key: "map", label: "Map", ready: true,
    icon: I(<><path d="M1 6l7-3 8 3 7-3v15l-7 3-8-3-7 3z" /><path d="M8 3v15M16 6v15" /></>) },
  { key: "ledger", label: "GDD", ready: true,
    icon: I(<><path d="M3 20h18M4 16c3-7 6-9 8-9s5 2 8 9" /></>) },
  { key: "almanac", label: "Almanac", ready: true,
    icon: I(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>) },
  { key: "crops", label: "Crops", ready: true,
    icon: I(<><path d="M12 22V10M12 10c-5 0-8-3-8-8 5 0 8 3 8 8zM12 14c0-4 3-7 8-7 0 5-3 8-8 8" /></>) },
  { key: "pests", label: "Pests", ready: true,
    icon: I(<><circle cx="12" cy="13" r="6" /><path d="M12 7V4M8 8L5 5M16 8l3-3M4 13H1M23 13h-3M6 18l-3 3M18 18l3 3" /></>) },
  { key: "wildlife", label: "Wildlife", ready: true,
    icon: I(<><path d="M4 14c0-4 3-7 8-7s8 3 8 7" /><path d="M8 7L6 3M16 7l2-4" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /><path d="M12 16v3" /></>) },
  { key: "todo", label: "Tasks", ready: true,
    icon: I(<><path d="M9 11l2 2 4-4" /><rect x="3" y="4" width="18" height="16" rx="2" /></>) },
  { key: "reports", label: "Field Reports", ready: true,
    icon: I(<><path d="M4 4h12l4 4v12H4z" /><path d="M8 12h8M8 16h8" /></>) },
  { key: "references", label: "References", ready: true,
    icon: I(<><path d="M4 5a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M15 3v5h5M8 13h8M8 17h5" /></>) },
  { key: "about", label: "About", ready: true,
    icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>) },
];

interface Props {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  npub: string;
  avatar: string;
  displayName: string;
  region: SavedRegion;
  onRegion: (r: SavedRegion) => void;
  conditions?: ReactNode;
  /// The skep, handed in by the app so the shell does not need to know what a
  /// bee is. It sits in the foot of the rail.
  hive?: ReactNode;
  children: ReactNode;
}

export default function AppShell({
  view, onView, npub, avatar, displayName, region, onRegion,
  conditions, hive, children,
}: Props) {
  const [order, setOrder] = useState<string[] | null>(() => readOrder());
  const [collapsed, setCollapsed] = useState(() => readCollapsed());
  const [editing, setEditing] = useState(false);
  const items = applyOrder(RAIL, order);

  useEffect(() => { writeCollapsed(collapsed); }, [collapsed]);

  function reorder(from: number, to: number) {
    const next = move(items, from, to).map((i) => i.key);
    setOrder(next);
    writeOrder(next);
  }

  return (
    <div className={`grid h-full grid-cols-1 grid-rows-[56px_1fr_56px] md:grid-rows-[56px_1fr] ${
      collapsed ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[200px_1fr]"
    }`}>
      <nav aria-label="Views"
        className="row-start-3 flex gap-0.5 overflow-x-auto overscroll-x-contain bg-ink p-1.5 text-rail-ink [-webkit-overflow-scrolling:touch] md:row-span-2 md:row-start-1 md:flex-col md:p-4">
        <div className="hidden items-center justify-between pl-2 pt-1 pb-4 md:flex">
          {!collapsed && (
            <span>
              <span className="figure text-[21px] font-bold text-paper">Good </span>
              <span className="figure text-[21px] font-normal italic text-honey">Earth</span>
            </span>
          )}
          <button
            onClick={() => { setCollapsed((c) => !c); setEditing(false); }}
            aria-label={collapsed ? "Expand the rail" : "Collapse the rail"}
            title={collapsed ? "Expand" : "Collapse"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-[15px] text-rail-ink hover:bg-white/10"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        {items.map((it, i) => {
          const active = it.key === view;
          return (
            <div key={it.key} className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => it.ready && !editing && onView(it.key)}
                disabled={!it.ready}
                title={it.ready ? it.label : it.soon}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-11 flex-1 shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium",
                  "flex-col gap-1 text-[10px] md:flex-row md:gap-2.5 md:text-[13.5px]",
                  collapsed ? "md:justify-center md:px-0" : "",
                  active ? "bg-paper text-ink" : "text-rail-ink",
                  it.ready ? "hover:bg-white/10" : "cursor-default opacity-40",
                ].join(" ")}
              >
                {it.icon}
                <span className={collapsed ? "md:hidden" : ""}>{it.label}</span>
              </button>

              {/* Reordering by buttons rather than by drag. A long-press drag
                  on a touchscreen fights the browser's own text selection and
                  scroll, and gets it wrong often enough that people stop
                  trying — two arrows always work. */}
              {editing && !collapsed && (
                <span className="hidden shrink-0 flex-col md:flex">
                  <button onClick={() => reorder(i, i - 1)} disabled={i === 0}
                    aria-label={`Move ${it.label} up`}
                    className="flex h-5 w-6 items-center justify-center text-[11px] text-rail-ink hover:bg-white/10 disabled:opacity-25">▲</button>
                  <button onClick={() => reorder(i, i + 1)} disabled={i === items.length - 1}
                    aria-label={`Move ${it.label} down`}
                    className="flex h-5 w-6 items-center justify-center text-[11px] text-rail-ink hover:bg-white/10 disabled:opacity-25">▼</button>
                </span>
              )}
            </div>
          );
        })}

        <div className="hidden flex-1 md:block" />

        {!collapsed && (
          <button
            onClick={() => setEditing((e) => !e)}
            className="hidden min-h-11 items-center gap-2 rounded-md px-2.5 text-[12px] text-rail-ink/70 hover:bg-white/10 md:flex"
          >
            {editing ? "✓ Done" : "⇅ Reorder"}
          </button>
        )}
        {/* The skep. It reads the same night the frost card does, so the foot
            of the rail can never disagree with the page. */}
        {hive && <div className="-mx-2 hidden pt-3 md:block">{hive}</div>}
      </nav>

      <header className="col-start-1 row-start-1 flex items-center gap-3.5 border-b border-rule bg-paper px-4 md:col-start-2 md:px-5">
        <RegionPicker active={region} onPick={onRegion} onMap={() => onView("map")} />
        <div className="hidden text-[12.5px] text-ink-soft lg:block">{conditions}</div>

        {/* Balance and sign-out live on the account page now. Two persistent
            chrome elements for things a grower touches rarely cost more room
            than they earned, and the rail foot they free is where the skep
            belongs. */}
        <button
          onClick={() => onView("account")}
          aria-current={view === "account" ? "page" : undefined}
          title={displayName || "Your account"}
          className={`ml-auto flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-2 py-1 text-[12px] ${
            view === "account" ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"
          }`}
        >
          <Avatar value={avatar} size={26} />
          <span className="hidden max-w-[9rem] truncate sm:block">
            {displayName || (npub ? `${npub.slice(0, 8)}…` : "Account")}
          </span>
        </button>
      </header>

      <main className="relative col-start-1 row-start-2 overflow-auto px-5 pt-5 pb-16 md:col-start-2 md:px-6">
        {/* Keyed on the view so a failure on one page clears when the grower
            moves to another, rather than following them around. */}
        <Boundary key={view} what="This page">{children}</Boundary>
      </main>
    </div>
  );
}
