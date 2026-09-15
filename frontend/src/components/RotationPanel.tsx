// What grew on this plot, season by season, by plant family.
//
// The record, laid out — never a recommendation. A family that grew here in
// another season says which one, because that is the fact a grower planning a
// bed is looking for; what they do with it is theirs.
//
// Each crop is also a way back onto the ledger: a tap puts that plant in the
// add form with the figures it had, and the grower picks the day it goes in.

import type { RotationPlanting, SeasonRow } from "../lib/rotation";
import { Empty } from "./ui";

export default function RotationPanel({ rows, more, onRepeat }: {
  rows: SeasonRow[];
  more?: string;
  /// Plant this crop again. Absent, the crops are plain text.
  onRepeat?: (p: RotationPlanting, season: number) => void;
}) {
  if (!rows.length) {
    return <Empty>No dated plantings on this plot yet — rotation reads the season each one went in.</Empty>;
  }

  const crop = (name: string, r: SeasonRow, i: number) => {
    const from = r.repeat[name];
    return (
      <span key={name}>
        {i > 0 && ", "}
        {onRepeat && from ? (
          <button type="button" onClick={() => onRepeat(from, r.season)}
            title={`Plant ${name} again this season`}
            className="inline-flex min-h-9 items-center rounded px-1 underline decoration-dotted underline-offset-2 active:bg-band">
            {name}
          </button>
        ) : name}
      </span>
    );
  };

  return (
    <div className="mb-3 rounded-md border border-rule bg-panel px-4 py-3 text-[13px] leading-relaxed">
      {onRepeat && (
        <p className="mb-2 text-[12px] text-ink-soft">
          Tap a crop to plant it again — the form above fills in, and you choose the day.
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.season}>
            <b className="figure text-[15px]">{r.season}</b>
            <ul className="mt-1 space-y-1 pl-3">
              {r.families.map((g) => (
                <li key={g.family}>
                  <b>{g.family}</b>
                  {g.common && <span className="text-ink-soft"> ({g.common})</span>}
                  {" — "}{g.crops.map((c, i) => crop(c, r, i))}
                  {g.alsoIn.length > 0 && (
                    <span className="data ml-2 text-[11px] text-ink-soft">also here {g.alsoIn.join(", ")}</span>
                  )}
                </li>
              ))}
              {r.unplaced.length > 0 && (
                <li className="text-ink-soft">family not known — {r.unplaced.map((c, i) => crop(c, r, i))}</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
      {more && <p className="data mt-2 text-[11px] text-ink-soft">{more}</p>}
    </div>
  );
}
