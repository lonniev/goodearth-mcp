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

/// Shown while a subject's life cycle is looked up: the naturalist's
/// tradition of the field study, going out and looking closely. The corpus,
/// with how each line was checked, is `quotes-naturalist.json` in the
/// dpyc-community registry; this copy shows at once and when it cannot be read.
export const NATURALIST_SOURCE =
  "https://raw.githubusercontent.com/lonniev/dpyc-community/main/quotes-naturalist.json";

export const NATURALIST_QUOTES: ReadonlyArray<Quote> = [
  { text: "All nature is so full that that district produces the greatest variety which is the most examined.",
    author: "Gilbert White, The Natural History of Selborne" },
  { text: "I frequently tramped eight or ten miles through the deepest snow to keep an appointment with a beech-tree, or a yellow-birch, or an old acquaintance among the pines.",
    author: "Henry David Thoreau, Walden" },
  { text: "The question is not what you look at, but what you see.",
    author: "Henry David Thoreau, Journal, 5 August 1851" },
  { text: "Heaven is under our feet as well as over our heads.",
    author: "Henry David Thoreau, Walden" },
  { text: "In every walk with Nature one receives far more than he seeks.",
    author: "John Muir, Steep Trails" },
  { text: "It is interesting to contemplate an entangled bank, clothed with many plants of many kinds, with birds singing on the bushes, with various insects flitting about, and with worms crawling through the damp earth…",
    author: "Charles Darwin, On the Origin of Species" },
  { text: "Instructions for living a life: Pay attention. Be astonished. Tell about it.",
    author: "Mary Oliver, Sometimes" },
  { text: "Those who contemplate the beauty of the earth find reserves of strength that will endure as long as life lasts.",
    author: "Rachel Carson, The Sense of Wonder" },
  { text: "There are some who can live without wild things, and some who cannot.",
    author: "Aldo Leopold, A Sand County Almanac" },
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
