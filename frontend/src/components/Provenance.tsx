// Provenance line — WHEN this answer was read.
//
// NOT what it cost. A fare on every answer on every page is a number nobody
// came for: a grower reading the season wants the season, and the running
// total belongs on the Account page where they went to look at money. The
// price is still FETCHED, because that total is real and is reported up
// through `onCost` — it is simply not printed beside the reading.
//
// The figure was never a constant and must not become one: prices live in the
// operator's pricing model and move without a redeploy, so a number baked into
// this file would be a lie the first time the model changed.

import { useEffect } from "react";
import { checkPrice } from "../lib/mcp";

export default function Provenance({
  tool, at, onCost, from, hideTime,
}: {
  tool: string;
  at: Date | null;
  /// Reported up so the Account page can total the session's spend.
  onCost?: (sats: number) => void;
  /// When the NUMBERS were read, if that is not when the call was made. The
  /// server serves its last reading when the weather service is busy — better
  /// than an outage on the page, but only if the page says so.
  from?: Date | null;
  /// The caller prints the reading time itself — in its own heading, say — so
  /// this renders nothing and keeps only the pricing it was already doing.
  /// Two copies of "read 8:28 PM" on one row is one copy too many.
  hideTime?: boolean;
}) {
  useEffect(() => {
    if (!at || !onCost) return;
    let live = true;
    checkPrice(tool)
      .then((p) => { if (live && p != null) onCost(p); })
      .catch(() => { /* the answer stands even if its price is unreadable */ });
    return () => { live = false; };
    // Re-priced per call: a constraint or a surge window can move the fare
    // between one answer and the next, and the total has to follow it.
  }, [tool, at, onCost]);

  if (!at || hideTime) return null;

  const clock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  // A reading from an earlier day needs its day named. Within today the time
  // alone is the whole story, and the date would only be noise.
  const when = (d: Date) =>
    d.toDateString() === at.toDateString()
      ? clock(d)
      : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${clock(d)}`;

  return (
    <span className="data ml-auto text-right text-[10.5px] font-normal text-ink-soft"
      title={from
        ? "The weather service was busy, so this is the last reading taken of this ground"
        : "When this answer was read"}>
      read {clock(at)}
      {from && ` · weather from ${when(from)}`}
    </span>
  );
}
