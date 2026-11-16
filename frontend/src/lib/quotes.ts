// Good Earth's own quotes for a wait: the agrarian tradition, because the
// app is about land. The scroller that shows them is @tollbooth-dpyc/web's;
// how they look is ours — quoteStyles, passed at every call site.
//
// AGRARIAN_SOURCE is the corpus in the dpyc-community registry, so the set can
// be edited without a redeploy; AGRARIAN_QUOTES shows at once and stays when
// the registry cannot be reached.

import type { Quote } from "@tollbooth-dpyc/web";
import type { QuoteScrollerClassNames } from "@tollbooth-dpyc/web/react";
import { tr } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/en.ts";

/** Quotes whose words are read from `lib.quotes.<set>.<n>` each time one is
 *  shown, so the scroller speaks the language on screen. The author's name
 *  stays as written. One array per set, so callers still pass a constant. */
function worded(set: string, authors: string[]): ReadonlyArray<Quote> {
  return authors.map((author, i) => ({
    author,
    get text() { return tr(`lib.quotes.${set}.${i + 1}` as MessageKey); },
  }));
}

export const AGRARIAN_SOURCE =
  "https://raw.githubusercontent.com/lonniev/dpyc-community/main/quotes-agrarian.json";

export const AGRARIAN_QUOTES: ReadonlyArray<Quote> = worded("agrarian", [
  "J.R.R. Tolkien, The Hobbit",
  "Thomas Jefferson, Notes on the State of Virginia",
  "Virgil, Georgics",
  "Booker T. Washington, Up From Slavery",
  "Dwight D. Eisenhower",
  "G.K. Chesterton, The Uses of Diversity",
  "Hesiod, Works and Days",
]);

/// Shown while a subject's life cycle is looked up: the naturalist's
/// tradition of the field study, going out and looking closely. The corpus,
/// with how each line was checked, is `quotes-naturalist.json` in the
/// dpyc-community registry; this copy shows at once and when it cannot be read.
/// What a grower reads while a first lookup runs. True by construction: the
/// service gives the edit at most 90 s (`llm_answer.TIMEOUT_S`).
export const researchWait = (): string => tr("lib.quotes.researchWait");

export const NATURALIST_SOURCE =
  "https://raw.githubusercontent.com/lonniev/dpyc-community/main/quotes-naturalist.json";

export const NATURALIST_QUOTES: ReadonlyArray<Quote> = worded("naturalist", [
  "Gilbert White, The Natural History of Selborne",
  "Henry David Thoreau, Walden",
  "Henry David Thoreau, Journal, 5 August 1851",
  "Henry David Thoreau, Walden",
  "John Muir, Steep Trails",
  "Charles Darwin, On the Origin of Species",
  "Mary Oliver, Sometimes",
  "Rachel Carson, The Sense of Wonder",
  "Aldo Leopold, A Sand County Almanac",
]);

/** The almanac's look: a soft-ink eyebrow, a display-face italic quote between
 *  honey marks, the author in the data face. */
export const quoteStyles: QuoteScrollerClassNames = {
  root: "px-4 py-6 text-center",
  heading: "eyebrow mb-5",
  figure: "m-0 mx-auto flex min-h-[124px] max-w-[520px] flex-col justify-center gap-3",
  text: "m-0 figure text-[1.0625rem] font-normal italic leading-relaxed text-ink",
  mark: "mx-0.5 not-italic text-honey",
  author: "data text-[0.65625rem] uppercase tracking-[0.22em] text-ink-soft",
};
