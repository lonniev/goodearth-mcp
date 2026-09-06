// What the words mean.
//
// Asked for by a grower who is new to farming by numbers and kept meeting
// "GDD" with nothing to click. The inline `Term` disclosures answered that
// where somebody had thought to add one — five words, on two pages — and this
// is the same definitions in one place, reachable on purpose rather than by
// happening to tap the right thing.
//
// One column, deliberately. This is read on a phone in a field more than
// anywhere else, and a glossary in two columns on a 390 px screen is a
// glossary nobody scrolls to the end of.

import { useState } from "react";
import { GLOSSARY, GROUPS, searchGlossary } from "../lib/glossary";
import { FIELD } from "../components/ui";

export default function Glossary() {
  const [q, setQ] = useState("");
  const hits = searchGlossary(q);
  const searching = q.trim().length > 0;

  return (
    <div className="max-w-2xl">
      <h1 className="figure text-[26px] leading-tight font-bold">
        What the words mean
      </h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
        Every term this site uses. Several of them are figures you supply
        rather than ones it knows — those say so.
      </p>

      <div className="sticky top-0 z-10 -mx-1 mt-3 bg-paper px-1 pt-1 pb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the words"
          aria-label="Search the glossary"
          className={FIELD}
        />
      </div>

      {searching && (
        <p className="data mb-2 text-[11px] text-ink-soft">
          {hits.length === 0
            ? "Nothing by that name."
            : `${hits.length} of ${GLOSSARY.length}`}
        </p>
      )}

      {/* Grouped while browsing, flat while searching. A search that keeps its
          headings makes the reader count empty sections to find two hits. */}
      {searching ? (
        <dl className="space-y-3">
          {hits.map((e) => <Definition key={e.key} term={e.term} said={e.said} aka={e.aka} />)}
        </dl>
      ) : (
        GROUPS.map((g) => {
          const rows = GLOSSARY.filter((e) => e.group === g.key);
          if (!rows.length) return null;
          return (
            <section key={g.key}>
              <h2 className="figure mt-6 mb-2 text-[16px] font-semibold">{g.label}</h2>
              <dl className="space-y-3">
                {rows.map((e) => (
                  <Definition key={e.key} term={e.term} said={e.said} aka={e.aka} />
                ))}
              </dl>
            </section>
          );
        })
      )}
    </div>
  );
}

function Definition({ term, said, aka }: {
  term: string; said: string; aka?: string[];
}) {
  return (
    <div className="rounded-md border border-rule bg-panel px-3.5 py-3">
      <dt className="figure text-[14.5px] font-semibold">
        {term}
        {aka && aka.length > 0 && (
          <span className="data ml-2 text-[10.5px] font-normal text-ink-soft">
            {aka.join(" · ")}
          </span>
        )}
      </dt>
      <dd className="mt-1 text-[13px] leading-relaxed text-ink-soft">{said}</dd>
    </div>
  );
}
