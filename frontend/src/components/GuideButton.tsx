// The (?) in the top bar: how the page on screen is used.
//
// One control in one place for every page, rather than a mark each view has
// to remember to draw in its own corner — the Dashboard's corner holds its
// chips, Flora's holds its form. It is the same round button as the
// full-screen control beside it, so the top row reads as one set.
//
// Nothing on a page that has no guide: the guides themselves, the account
// page, the free reading. A (?) that opened nothing would be worse than none.

import { guideFor } from "../lib/guides";
import type { ViewKey } from "../lib/views";
import { tour } from "../lib/tour/targets";
import { Glyph, ICON } from "./ui";

export default function GuideButton({ view, onView }: {
  view: ViewKey;
  onView: (v: ViewKey) => void;
}) {
  const guide = guideFor(view);
  if (!guide) return null;
  const label = "How this page works";
  return (
    <button type="button" aria-label={label} title={label} {...tour("shell.guide")}
      onClick={() => onView(guide)}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-rule text-ink-soft active:bg-band">
      <Glyph path={ICON.ask} />
    </button>
  );
}
