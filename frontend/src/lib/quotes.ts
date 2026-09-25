// Good Earth's own quotes for a wait: the agrarian tradition, because the
// app is about land. The scroller that shows them is @tollbooth-dpyc/web's.
//
// AGRARIAN_SOURCE is the corpus in the dpyc-community registry, so the set can
// be edited without a redeploy; AGRARIAN_QUOTES shows at once and stays when
// the registry cannot be reached.

import type { Quote } from "@tollbooth-dpyc/web";

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
