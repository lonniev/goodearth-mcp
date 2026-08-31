// Provenance line — which tool answered, when, and what it cost.
//
// The DPYC economics stay visible but quiet. The figure is read live from
// check_price and is NEVER a constant: prices live in the operator's pricing
// model and change without a redeploy, so a number baked into this file would
// become a lie the first time the model moves.

import { useEffect, useState } from "react";
import { checkPrice } from "../lib/mcp";

export default function Provenance({
  tool, at, onCost,
}: {
  tool: string;
  at: Date | null;
  /// Reported up so the top bar can total the session's spend.
  onCost?: (sats: number) => void;
}) {
  const [sats, setSats] = useState<number | null>(null);

  useEffect(() => {
    if (!at) return;
    let live = true;
    checkPrice(tool)
      .then((p) => {
        if (!live || p == null) return;
        setSats(p);
        onCost?.(p);
      })
      .catch(() => { /* the answer stands even if its price is unreadable */ });
    return () => { live = false; };
    // Re-price per call: a constraint or a surge window can move the fare
    // between one answer and the next.
  }, [tool, at, onCost]);

  if (!at) return null;

  return (
    <span className="data ml-auto text-right text-[10.5px] font-normal text-ink-soft">
      {tool} · {at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      {sats != null && (
        <>
          {" · "}
          <span className="text-honey">{sats === 0 ? "free" : `${sats} sat${sats === 1 ? "" : "s"}`}</span>
        </>
      )}
    </span>
  );
}
