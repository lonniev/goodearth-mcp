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
  tool, at, onCost,
}: {
  tool: string;
  at: Date | null;
  /// Reported up so the Account page can total the session's spend.
  onCost?: (sats: number) => void;
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

  if (!at) return null;

  return (
    <span className="data ml-auto text-right text-[10.5px] font-normal text-ink-soft"
      title="When this answer was read">
      read {at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}
