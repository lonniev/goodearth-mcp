// What grew on this plot, season by season, by plant family.
//
// The record, laid out — never a recommendation. A family that grew here in
// another season says which one, because that is the fact a grower planning a
// bed is looking for; what they do with it is theirs.

import type { SeasonRow } from "../lib/rotation";
import { Empty } from "./ui";

export default function RotationPanel({ rows, more }: { rows: SeasonRow[]; more?: string }) {
  if (!rows.length) {
    return <Empty>No dated plantings on this plot yet — rotation reads the season each one went in.</Empty>;
  }
  return (
    <div className="mb-3 rounded-md border border-rule bg-panel px-4 py-3 text-[13px] leading-relaxed">
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.season}>
            <b className="figure text-[15px]">{r.season}</b>
            <ul className="mt-1 space-y-1 pl-3">
              {r.families.map((g) => (
                <li key={g.family}>
                  <b>{g.family}</b>
                  {g.common && <span className="text-ink-soft"> ({g.common})</span>}
                  {" — "}{g.crops.join(", ")}
                  {g.alsoIn.length > 0 && (
                    <span className="data ml-2 text-[11px] text-ink-soft">also here {g.alsoIn.join(", ")}</span>
                  )}
                </li>
              ))}
              {r.unplaced.length > 0 && (
                <li className="text-ink-soft">family not known — {r.unplaced.join(", ")}</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
      {more && <p className="data mt-2 text-[11px] text-ink-soft">{more}</p>}
    </div>
  );
}
