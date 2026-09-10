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
import { addLabel, clampPage, finderState, holds, toggle,
  type Chosen } from "../lib/basket";
import { FIELD, ICON, IconButton, LIFECYCLE, LifecycleMark, Pill } from "./ui";
import SpeciesCard from "./SpeciesCard";
import Term from "./Term";

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
  /// Which row is open for reading. A search for "maple" returns box elder,
  /// and no name tells you whether that is the tree or the bug that lives on
  /// it — so a row can be read before it is chosen.
  const [reading, setReading] = useState<number | null>(null);
  /// Only the ones with a published life cycle.
  ///
  /// Server-side, because filtering the twenty rows in hand would answer "one
  /// of the twenty on this page" — the page size standing in for the total,
  /// which is the fault this whole finder replaced. Thirty-nine of the 2,416
  /// insects around one block have one, and turning 121 pages to find them is
  /// not finding them.
  const [onlyCycle, setOnlyCycle] = useState(false);

  // A new search starts at the beginning. Staying on page 40 while the result
  // shrinks to thirteen shows an empty page and no reason for it.
  useEffect(() => { setPage(1); setReading(null); }, [q, kingdom, onlyCycle]);

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      nearbySpecies(block, kingdom, q.trim(), page, onlyCycle)
        .then((r) => {
          if (ac.signal.aborted) return;
          if (!r.success) {
            // Clear the page as well. Rows from the last good search sitting
            // under an error about this one is the same lie in reverse.
            setErr(r.error || "Nothing could be read.");
            setRows([]); setTotal(0); setPages(1);
            return;
          }
          setErr("");
          setRows(r.items ?? []);
          setTotal(r.total ?? 0);
          setPages(r.pages ?? 1);
        })
        .catch((e) => { if (!ac.signal.aborted) setErr(String((e as Error).message ?? e)); })
        .finally(() => { if (!ac.signal.aborted) setBusy(false); });
    }, DEBOUNCE_MS);
    return () => { ac.abort(); clearTimeout(t); };
  }, [block, kingdom, q, page, onlyCycle]);

  const go = (to: number) => setPage(clampPage(to, total, 20));
  const state = finderState({ busy, error: err, rows: rows.length, total, page, pages });

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
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Pill active={onlyCycle} onClick={() => setOnlyCycle((v) => !v)}
          title="Only the ones USA-NPN publishes a life cycle for">
          {LIFECYCLE} Has a life cycle
        </Pill>
        <span className="data text-[11px] text-ink-soft">
          Tap a name to read what it is · <LifecycleMark /> a published life cycle
        </span>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-clay">{err}</p>}

      {/* The count is the point. "20 of 3,542" is what the old catalogue never
          said — it showed forty and left the rest unmentioned.

          `finderState` decides which of these is true, because they were
          conflated: a call that FAILED still printed "Nothing recorded by
          that name near here" under its own error. Nothing was found because
          nothing was asked. */}
      {state.kind !== "failed" && (
        <p className="data mt-2 text-[11px] text-ink-soft">
          {state.kind === "busy" ? "Looking…"
            : state.kind === "empty" ? "Nothing recorded by that name near here."
            : `${state.shown} of ${state.total.toLocaleString()} · page ${state.page} of ${state.pages}`}
          {basket.length > 0 && ` · ${basket.length} chosen`}
        </p>
      )}

      {/* No empty list frame behind an error: a bordered box with nothing in
          it reads as an answer. */}
      {state.kind !== "failed" && (
      <ul className="mt-1.5 divide-y divide-rule rounded-md border border-rule bg-panel">
        {rows.map((r) => {
          const id = Number(r.taxon_id);
          const on = holds(basket, id);
          return (
            <li key={`${id}-${r.name}`}>
              {/* The checkbox chooses; the rest of the row opens what the row
                  IS. They were one target, so the only way to find out what
                  you were adding was to add it. */}
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <input type="checkbox" className="size-4 shrink-0" checked={on}
                  aria-label={`Choose ${r.name}`}
                  onChange={() => setBasket((b) => toggle(b, {
                    taxonId: id, name: r.name,
                    scientificName: r.scientific_name, photo: r.photo,
                  }))} />
                <button type="button"
                  onClick={() => setReading((cur) => (cur === id ? null : id))}
                  aria-expanded={reading === id}
                  title={`What is ${r.name}?`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:bg-band">
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
                    {/* The glyph, not the sentence. It carries the glossary's
                        own words, so it can be asked what it means wherever it
                        appears rather than only in the legend. */}
                    {r.has_habits && <span className="block"><LifecycleMark /></span>}
                  </span>
                </button>
              </div>
              {reading === id && (
                <div className="px-2.5 pb-2">
                  <SpeciesCard
                    taxonId={id}
                    fallbackName={r.name}
                    nearby={r.observations}
                    chosen={on}
                    hasYear={r.has_habits}
                    onToggle={() => setBasket((b) => toggle(b, {
                      taxonId: id, name: r.name,
                      scientificName: r.scientific_name, photo: r.photo,
                    }))}
                    onClose={() => setReading(null)} />
                </div>
              )}
            </li>
          );
        })}
        {state.kind === "empty" && (
          <li className="px-3 py-4 text-[12.5px] text-ink-soft">
            Nothing here. Try a shorter word, or clear the search to see what is
            most recorded.
          </li>
        )}
      </ul>
      )}

      {state.kind === "results" && pages > 1 && (
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
            <Term label="counts are observations" of="observations" />
          </span>
        </div>
      )}
    </div>
  );
}
