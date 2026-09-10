// What a row actually is, read before you commit to it.
//
// A search for "maple" returns **box elder**. A grower cannot tell from that
// name whether it is the Acer or the bug that lives on it — both exist, both
// are called box elder, and only one is a tree. Putting the wrong one on your
// ground is a quiet mistake that surfaces a season later.
//
// So a row opens. The lineage settles it in a glance — "maples" against
// "Boxelder Bugs" — and iNaturalist's summary says it in words, with links to
// check for yourself. Choosing happens from here too, so reading and picking
// are one gesture rather than two.

import { useEffect, useState } from "react";
import { LifecycleMark } from "./ui";
import { speciesDetail, type SpeciesDetail } from "../lib/species";
import Term from "./Term";

export default function SpeciesCard({
  taxonId, fallbackName, chosen, onToggle, onClose, hasYear, nearby,
}: {
  taxonId: number;
  /// How many were recorded NEAR this block. The detail endpoint reports
  /// iNaturalist's worldwide count, which is a different number entirely —
  /// 64 near here against 193,860 everywhere — and showing one under the
  /// word the other used would read as a contradiction.
  nearby?: number;
  /// Shown while the detail is loading, so the card is never nameless.
  fallbackName: string;
  chosen: boolean;
  onToggle: () => void;
  onClose: () => void;
  hasYear?: boolean;
}) {
  const [info, setInfo] = useState<SpeciesDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    setBusy(true); setErr(""); setInfo(null);
    speciesDetail(taxonId, ac.signal)
      .then((d) => { if (!ac.signal.aborted) setInfo(d); })
      .catch((e) => { if (!ac.signal.aborted) setErr(String((e as Error).message ?? e)); })
      .finally(() => { if (!ac.signal.aborted) setBusy(false); });
    return () => ac.abort();
  }, [taxonId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="mt-1.5 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-3.5 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="figure text-[15px]">{info?.commonName ?? fallbackName}</b>
        {info?.scientificName && (
          <i className="text-[12px] text-ink-soft">{info.scientificName}</i>
        )}
        {info?.kingdom && (
          <span className="data rounded-full border border-rule px-2 py-0.5 text-[10.5px] text-ink-soft">
            {info.rank && info.rank !== "species" ? `${info.rank} · ` : ""}
            {info.kingdom}
          </span>
        )}
        <button onClick={onClose} aria-label="Close"
          className="ml-auto inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-ink">
          ×
        </button>
      </div>

      {err && <p className="mt-1 text-[12.5px] text-clay">{err}</p>}
      {busy && !err && <p className="data mt-1 text-[11px] text-ink-soft">Reading…</p>}

      {info && (
        <>
          <div className="mt-2 flex gap-3">
            {info.photo && (
              <img src={info.photo} alt="" width={96} height={96} loading="lazy"
                className="size-24 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              {/* The lineage is the answer to "which box elder is this". */}
              {info.lineage.length > 0 && (
                <p className="data text-[10.5px] leading-relaxed text-ink-soft">
                  {info.lineage.join(" › ")}
                </p>
              )}
              <p className="mt-1 data text-[10.5px] text-ink-soft">
                <Term
                  label={nearby != null
                    ? `${nearby.toLocaleString()} near here`
                    : "observations"}
                  of="observations" />
                {" · "}
                {info.observations.toLocaleString()} worldwide
                {hasYear && <> · <LifecycleMark /></>}
              </p>
            </div>
          </div>

          {info.summary && (
            <p className="mt-2 text-[12.5px] leading-relaxed">{info.summary}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button onClick={onToggle}
              className={`min-h-11 rounded-full border px-4 text-[12.5px] font-semibold ${
                chosen ? "border-ink bg-ink text-paper" : "border-ink"}`}>
              {chosen ? "Chosen — tap to drop" : "Choose this one"}
            </button>
            <a href={info.inatUrl} target="_blank" rel="noreferrer"
              className="text-[12px] underline decoration-dotted underline-offset-2 text-ink-soft">
              iNaturalist
            </a>
            {info.wikipediaUrl && (
              <a href={info.wikipediaUrl} target="_blank" rel="noreferrer"
                className="text-[12px] underline decoration-dotted underline-offset-2 text-ink-soft">
                Wikipedia
              </a>
            )}
          </div>
          {info.photoBy && (
            <p className="data mt-1.5 text-[10px] text-ink-soft">{info.photoBy}</p>
          )}
        </>
      )}
    </div>
  );
}
