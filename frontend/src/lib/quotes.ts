// Good Earth's own quotes for a wait: the agrarian tradition, because the
// app is about land. The scroller that shows them is @tollbooth-dpyc/web's;
// how they look is ours — quoteStyles, passed at every call site.
//
// AGRARIAN_SOURCE is the corpus in the dpyc-community registry, so the set can
// be edited without a redeploy; AGRARIAN_QUOTES shows at once and stays when
// the registry cannot be reached.

import type { Quote } from "@tollbooth-dpyc/web";
import type { QuoteScrollerClassNames } from "@tollbooth-dpyc/web/react";

export const AGRARIAN_SOURCE =
  "https://raw.githubusercontent.com/lonniev/dpyc-community/main/quotes-agrarian.json";

export const AGRARIAN_QUOTES: ReadonlyArray<Quote> = [
  { text: "If more of us valued food and cheer and song above hoarded gold, it would be a merrier world.",
    author: "J.R.R. Tolkien, The Hobbit" },
  { text: "Those who labour in the earth are the chosen people of God, if ever He had a chosen people.",
    author: "Thomas Jefferson, Notes on the State of Virginia" },
  { text: "O fortunate farmers, excessively fortunate, if only they knew their own blessings!",
    author: "Virgil, Georgics" },
  { text: "No race can prosper till it learns that there is as much dignity in tilling a field as in writing a poem.",
    author: "Booker T. Washington, Up From Slavery" },
  { text: "Farming looks mighty easy when your plow is a pencil and you're a thousand miles from the corn field.",
    author: "Dwight D. Eisenhower" },
  { text: "Too much capitalism does not mean too many capitalists, but too few capitalists.",
    author: "G.K. Chesterton, The Uses of Diversity" },
  { text: "Observe the seasons, and do each thing in its own time.",
    author: "Hesiod, Works and Days" },
];

/** The almanac's look: a soft-ink eyebrow, a display-face italic quote between
 *  honey marks, the author in the data face. */
export const quoteStyles: QuoteScrollerClassNames = {
  root: "px-4 py-6 text-center",
  heading: "eyebrow mb-5",
  figure: "m-0 mx-auto flex min-h-[124px] max-w-[520px] flex-col justify-center gap-3",
  text: "m-0 figure text-[17px] font-normal italic leading-relaxed text-ink",
  mark: "mx-0.5 not-italic text-honey",
  author: "data text-[10.5px] uppercase tracking-[0.22em] text-ink-soft",
};
