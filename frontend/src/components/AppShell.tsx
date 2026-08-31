// App shell — persistent rail, top bar, and the content well.
//
// The rail carries the full Good Earth surface. Views whose tool has not
// shipped yet are present but dimmed rather than hidden: a grower should be
// able to see where the app is going, and a dimmed row is honest where an
// enabled row that leads to an empty page is not.

import type { ReactNode } from "react";
import Avatar from "./Avatar";
import RegionPicker from "./RegionPicker";
import type { SavedRegion } from "../lib/regions";

export type ViewKey =
  | "map" | "ledger" | "crops" | "pests" | "todo" | "reports" | "favorites" | "account";

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
  { key: "map", label: "Map", ready: true,
    icon: I(<><path d="M1 6l7-3 8 3 7-3v15l-7 3-8-3-7 3z" /><path d="M8 3v15M16 6v15" /></>) },
  { key: "ledger", label: "Heat Ledger", ready: true,
    icon: I(<><path d="M3 20h18M4 16c3-7 6-9 8-9s5 2 8 9" /></>) },
  { key: "crops", label: "Crops", ready: true,
    icon: I(<><path d="M12 22V10M12 10c-5 0-8-3-8-8 5 0 8 3 8 8zM12 14c0-4 3-7 8-7 0 5-3 8-8 8" /></>) },
  { key: "pests", label: "Pests", ready: true,
    icon: I(<><circle cx="12" cy="13" r="6" /><path d="M12 7V4M8 8L5 5M16 8l3-3M4 13H1M23 13h-3M6 18l-3 3M18 18l3 3" /></>) },
  { key: "todo", label: "To-Do", ready: false, soon: "Tasks born from the analytics above",
    icon: I(<><path d="M9 11l2 2 4-4" /><rect x="3" y="4" width="18" height="16" rx="2" /></>) },
  { key: "reports", label: "Field Reports", ready: true,
    icon: I(<><path d="M4 4h12l4 4v12H4z" /><path d="M8 12h8M8 16h8" /></>) },
  { key: "favorites", label: "Favorites", ready: true,
    icon: I(<><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></>) },
];

interface Props {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  npub: string;
  avatar: string;
  displayName: string;
  region: SavedRegion;
  onRegion: (r: SavedRegion) => void;
  balanceSats: number | null;
  spentToday: number | null;
  conditions?: ReactNode;
  onSignOut: () => void;
  children: ReactNode;
}

export default function AppShell({
  view, onView, npub, avatar, displayName, region, onRegion,
  balanceSats, spentToday, conditions, onSignOut, children,
}: Props) {
  return (
    <div className="grid h-full grid-cols-1 grid-rows-[56px_1fr_56px] md:grid-cols-[200px_1fr] md:grid-rows-[56px_1fr]">
      <nav aria-label="Views"
        className="row-start-3 flex gap-0.5 overflow-x-auto overscroll-x-contain bg-ink p-1.5 text-rail-ink [-webkit-overflow-scrolling:touch] md:row-span-2 md:row-start-1 md:flex-col md:p-4">
        <div className="hidden px-2 pt-1 pb-4 md:block">
          <span className="figure text-[21px] font-bold text-paper">Good </span>
          <span className="figure text-[21px] font-normal italic text-honey">Earth</span>
        </div>

        {RAIL.map((it) => {
          const active = it.key === view;
          return (
            <button
              key={it.key}
              onClick={() => it.ready && onView(it.key)}
              disabled={!it.ready}
              title={it.ready ? undefined : it.soon}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-11 shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium",
                "flex-col gap-1 text-[10px] md:flex-row md:gap-2.5 md:text-[13.5px]",
                active ? "bg-paper text-ink" : "text-rail-ink",
                it.ready ? "hover:bg-white/10" : "cursor-default opacity-40",
              ].join(" ")}
            >
              {it.icon}
              {it.label}
            </button>
          );
        })}

        <div className="hidden flex-1 md:block" />
        <button
          onClick={() => onView("account")}
          className="hidden items-center gap-2.5 border-t border-white/15 px-2 py-2.5 text-left text-[12px] md:flex hover:bg-white/5"
        >
          <Avatar value={avatar} size={28} />
          <span className="min-w-0">
            <span className="block truncate">{displayName || "Your account"}</span>
            <span className="data block truncate text-[10.5px] opacity-70">
              {npub ? `${npub.slice(0, 8)}…${npub.slice(-4)}` : ""}
            </span>
          </span>
        </button>
      </nav>

      <header className="col-start-1 row-start-1 flex items-center gap-3.5 border-b border-rule bg-paper px-4 md:col-start-2 md:px-5">
        <RegionPicker active={region} onPick={onRegion} />
        <div className="hidden text-[12.5px] text-ink-soft lg:block">{conditions}</div>

        <div
          className="data ml-auto inline-flex items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] border-ink bg-panel px-3 py-1 text-[12px]"
          title="Pre-funded balance. Each answer shows what it cost."
        >
          <span className="text-[13px] text-honey">⚡</span>
          <b>{balanceSats == null ? "—" : `${balanceSats.toLocaleString()} sats`}</b>
          {spentToday != null && spentToday > 0 && (
            <span className="text-ink-soft">· {spentToday} spent today</span>
          )}
        </div>
        <button onClick={onSignOut} className="min-h-11 px-2 text-[12px] text-ink-soft active:text-ink">Sign out</button>
      </header>

      <main className="relative col-start-1 row-start-2 overflow-auto px-5 pt-5 pb-16 md:col-start-2 md:px-6">
        {children}
      </main>
    </div>
  );
}
