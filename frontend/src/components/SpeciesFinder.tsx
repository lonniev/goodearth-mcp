// Finding things recorded near your ground, and choosing several of them.
//
// One chooser for every kind. Crops, Pests and Wildlife each had their own —
// a grid of chiclets, capped at 18 or 24 or 40 with no way to see the rest,
// where a tap did not add anything: it filled a field and scrolled you to a
// form. A grower who wanted six species did that six times.
//
// There are 3,542 insects and spiders recorded around one Vermont block, 2,267
// plants and 940 fungi. No wall of chiclets is the right shape for that. This
// is: a search box, twenty at a time, the true total on every page, and a
// basket that survives both searching and paging.
//
// The basket arithmetic is in `lib/basket.ts` where tests reach it — a basket
// keyed by name loses to two species sharing a common name, and one that
// resets on a new search discards what the grower already picked without
// telling them.

import { useEffect, useState } from "react";
import { nearbySpecies, type NearbyItem } from "../lib/mcp";
import { addLabel, clampPage, holds, toggle, type Chosen } from "../lib/basket";
import { FIELD, ICON, IconButton } from "./ui";

/// Long enough not to search on every keystroke, short enough to feel live.
const DEBOUNCE_MS = 300;

export type Kingdom = "plants" | "insects" | "wildlife" | "fungi";

export default function SpeciesFinder({
  block, blockName, kingdom, onAdd, adding, hint,
}: {
  block: string;
  /// Named in the button, because "Add 6" does not say where they are going.
  blockName: string;
  kingdom: Kingdom;
  /// Commits the basket. One write, not one per row — see `saveMany`.
  onAdd: (chosen: Chosen[]) => Promise<void>;
  adding?: boolean;
  hint?: string;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<NearbyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [basket, setBasket] = useState<Chosen[]>([]);

  // A new search starts at the beginning. Staying on page 40 while the result
  // shrinks to thirteen shows an empty page and no reason for it.
  useEffect(() => { setPage(1); }, [q, kingdom]);

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      nearbySpecies(block, kingdom, q.trim(), page)
        .then((r) => {
          if (ac.signal.aborted) return;
          if (!r.success) { setErr(r.error || "Nothing could be read."); return; }
          setErr("");
          setRows(r.items ?? []);
          setTotal(r.total ?? 0);
          setPages(r.pages ?? 1);
        })
        .catch((e) => { if (!ac.signal.aborted) setErr(String((e as Error).message ?? e)); })
        .finally(() => { if (!ac.signal.aborted) setBusy(false); });
    }, DEBOUNCE_MS);
    return () => { ac.abort(); clearTimeout(t); };
  }, [block, kingdom, q, page]);

  const go = (to: number) => setPage(clampPage(to, total, 20));

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 text-[11px] text-ink-soft" style={{ minWidth: 180 }}>
          Search what is recorded near {blockName}
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="bumble, maple, chanterelle…" autoComplete="off"
            className={FIELD} />
        </label>
        <IconButton path={ICON.add}
          label={adding ? "Adding…" : addLabel(basket, blockName)}
          onClick={() => { void onAdd(basket).then(() => setBasket([])); }}
          disabled={!basket.length || adding} />
      </div>

      {hint && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{hint}</p>}
      {err && <p className="mt-2 text-[12.5px] text-clay">{err}</p>}

      {/* The count is the point. "20 of 3,542" is what the old catalogue never
          said — it showed forty and left the rest unmentioned. */}
      <p className="data mt-2 text-[11px] text-ink-soft">
        {busy ? "Looking…"
          : total === 0 ? "Nothing recorded by that name near here."
          : `${rows.length} of ${total.toLocaleString()} · page ${page} of ${pages}`}
        {basket.length > 0 && ` · ${basket.length} chosen`}
      </p>

      <ul className="mt-1.5 divide-y divide-rule rounded-md border border-rule bg-panel">
        {rows.map((r) => {
          const id = Number(r.taxon_id);
          const on = holds(basket, id);
          return (
            <li key={`${id}-${r.name}`}>
              <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-2 active:bg-band">
                <input type="checkbox" className="size-4 shrink-0" checked={on}
                  onChange={() => setBasket((b) => toggle(b, {
                    taxonId: id, name: r.name,
                    scientificName: r.scientific_name, photo: r.photo,
                  }))} />
                {r.photo
                  ? <img src={r.photo} alt="" width={32} height={32} loading="lazy"
                      className="size-8 shrink-0 rounded object-cover" />
                  : <span className="size-8 shrink-0 rounded bg-band" aria-hidden="true" />}
                <span className="min-w-0 flex-1 leading-tight">
                  <b className="block truncate text-[13px]">{r.name}</b>
                  {r.scientific_name && (
                    <i className="block truncate text-[11px] text-ink-soft">
                      {r.scientific_name}
                    </i>
                  )}
                </span>
                <span className="data shrink-0 text-right text-[10.5px] text-ink-soft">
                  {(r.observations ?? 0).toLocaleString()}
                  {/* USA-NPN tracks a year for this one. It is the signal that
                      made the old grouped catalogue worth tapping. */}
                  {r.has_habits && <span className="block text-honey">has a year</span>}
                </span>
              </label>
            </li>
          );
        })}
        {!rows.length && !busy && (
          <li className="px-3 py-4 text-[12.5px] text-ink-soft">
            Nothing here. Try a shorter word, or clear the search to see what is
            most recorded.
          </li>
        )}
      </ul>

      {pages > 1 && (
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => go(page - 1)} disabled={page <= 1}
            className="min-h-11 rounded-full border border-rule px-3.5 text-[12.5px] disabled:opacity-40">
            ‹ Back
          </button>
          <button onClick={() => go(page + 1)} disabled={page >= pages}
            className="min-h-11 rounded-full border border-rule px-3.5 text-[12.5px] disabled:opacity-40">
            More ›
          </button>
          <span className="data text-[11px] text-ink-soft">
            counts are observations, which measure observers too
          </span>
        </div>
      )}
    </div>
  );
}
