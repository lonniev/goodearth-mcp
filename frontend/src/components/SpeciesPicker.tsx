// Naming a thing, by searching the catalogue an ecologist would search.
//
// Good Earth used to ship a list of 146 plants. A grower could not plant
// anything outside it, and every figure in it was as good as one afternoon's
// research. This replaces the list: the grower types, iNaturalist answers, and
// what gets saved is a taxon id — a pointer into a record somebody else keeps
// current — rather than a row copied out of one.
//
// **Why a picked list and not a resolved name.** iNaturalist ranks by how
// often a thing has been observed, so a bare shelf word lands on the wild
// cousin: "apple" leads with Solanum, "fig" with a prickly pear, "black
// currant" with the wild Ribes americanum rather than the Ribes nigrum
// somebody planted. Those answers are safe in front of a person and dangerous
// in front of code. So this shows the candidates, with a photograph and the
// binomial, and the grower says which one is theirs.
//
// The photograph is doing real work. A row of names is a quiz; a row of
// pictures is a recognition, and a grower knows their own tree by sight long
// before they know it by binomial.

import { useEffect, useRef, useState } from "react";
import { searchSpecies, type Kingdom, type SpeciesHit } from "../lib/species";
import { FIELD } from "./ui";

/// Long enough that a grower is not searching after one keystroke, short
/// enough that the list feels like it is keeping up.
const DEBOUNCE_MS = 250;

/// Everything a row already says, folded for comparison.
const shown = (h: SpeciesHit) =>
  `${h.commonName ?? ""} ${h.scientificName}`.toLowerCase();

export default function SpeciesPicker({
  kingdom, value, onPick, onClear, placeholder, autoFocus, seed,
}: {
  kingdom: Kingdom;
  /// A query to start from, so another part of the page can hand the picker a
  /// name — tapping a plant recorded nearby searches for it here rather than
  /// dropping a bare string into the record.
  seed?: string;
  /// What is already chosen, so the field can show it rather than sit empty.
  value?: { commonName?: string; scientificName?: string; thumb?: string | null } | null;
  onPick: (hit: SpeciesHit) => void;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<SpeciesHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (seed) { setText(seed); setOpen(true); }
  }, [seed]);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) { setHits([]); setBusy(false); return; }

    const ac = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      searchSpecies(q, kingdom, ac.signal)
        .then((r) => { if (!ac.signal.aborted) { setHits(r); setErr(""); } })
        .catch((e) => {
          if (ac.signal.aborted) return;
          // A search that could not be run is said so. An empty list would
          // read as "there is no such plant", which is a different claim.
          setHits([]);
          setErr(String((e as Error).message ?? e));
        })
        .finally(() => { if (!ac.signal.aborted) setBusy(false); });
    }, DEBOUNCE_MS);

    return () => { ac.abort(); clearTimeout(t); };
  }, [text, kingdom]);

  // A tap outside puts the list away without choosing anything.
  useEffect(() => {
    if (!open) return;
    function away(e: PointerEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function choose(h: SpeciesHit) {
    onPick(h);
    setText("");
    setHits([]);
    setOpen(false);
  }

  if (value?.commonName || value?.scientificName) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-md border border-rule bg-panel px-2.5 py-1.5">
        {value.thumb
          ? <img src={value.thumb} alt="" width={28} height={28}
              className="size-7 shrink-0 rounded object-cover" />
          : <span className="size-7 shrink-0 rounded bg-band" aria-hidden="true" />}
        <span className="min-w-0 flex-1 leading-tight">
          <b className="block truncate text-[13px]">{value.commonName ?? value.scientificName}</b>
          {value.scientificName && value.commonName && (
            <i className="block truncate text-[11px] text-ink-soft">{value.scientificName}</i>
          )}
        </span>
        {onClear && (
          <button type="button" onClick={onClear}
            className="min-h-9 shrink-0 rounded-full px-2.5 text-[12px] text-ink-soft active:bg-band">
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <input
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "Start typing a name…"}
        className={FIELD}
        autoComplete="off"
        aria-label="Search for a species"
      />

      {open && text.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-rule bg-panel shadow-lg">
          {err && <p className="px-3 py-2 text-[12px] text-clay">{err}</p>}
          {!err && !hits.length && (
            <p className="px-3 py-2 text-[12px] text-ink-soft">
              {busy ? "Looking…" : "Nothing by that name."}
            </p>
          )}
          {hits.map((h) => (
            <button key={h.id} type="button" onClick={() => choose(h)}
              className="flex w-full items-center gap-2.5 border-b border-rule px-2.5 py-2 text-left last:border-b-0 active:bg-band">
              {h.thumb
                ? <img src={h.thumb} alt="" width={32} height={32} loading="lazy"
                    className="size-8 shrink-0 rounded object-cover" />
                : <span className="size-8 shrink-0 rounded bg-band" aria-hidden="true" />}
              <span className="min-w-0 flex-1 leading-tight">
                <b className="block truncate text-[13px]">
                  {h.commonName ?? h.scientificName}
                </b>
                <i className="block truncate text-[11px] text-ink-soft">
                  {h.scientificName}
                  {h.rank && h.rank !== "species" && (
                    <span className="not-italic">{" · "}{h.rank}</span>
                  )}
                </i>
                {/* What actually matched, when it is not already on screen —
                    so a grower who typed "haskap" can see why they are being
                    shown a honeysuckle. Substring, not equality: "Schneck's
                    sugar maple" matched on "sugar maple", and saying so under
                    a row that already reads "sugar maple" is noise. */}
                {h.matched && !shown(h).includes(h.matched.toLowerCase()) && (
                  <span className="data block truncate text-[10.5px] text-ink-soft">
                    matched “{h.matched}”
                  </span>
                )}
              </span>
            </button>
          ))}
          {!err && hits.length > 0 && (
            <p className="data px-2.5 py-1.5 text-[10.5px] text-ink-soft">
              iNaturalist · most-recorded first
            </p>
          )}
        </div>
      )}
    </div>
  );
}
