// The shape of one page's guide. The content files in this directory fill
// it; `views/HowTo.tsx` draws it. Kept as data rather than as eight pages of
// free-form JSX so every guide has the same three parts in the same order,
// and a reader who has learned one has learned them all.

import type { ReactNode } from "react";

/// One control, and what it does. The first cell is the thing on screen — a
/// button's label, a glyph, a column — so the reader can find it; the second
/// is what happens.
export type Step = [control: ReactNode, does: ReactNode];

/// A group of controls under the verb they share: adding, reading, changing,
/// removing.
export interface Using {
  emoji: string;
  heading: string;
  steps: Step[];
}

export interface Guide {
  /// The one idea, before anything else.
  claim: ReactNode;
  /// The biology or the phenomenon the page is about. Why the page exists.
  phenomenon: ReactNode;
  /// Three facts, not three paragraphs. Optional.
  facts?: [string, ReactNode][];
  /// The controls, grouped by what they do to the record.
  using: Using[];
  /// The same work through an agent: one paragraph, one worked example,
  /// and the tools it reaches for.
  agent: {
    lead: ReactNode;
    /// What the grower would say to Claude, in their own words.
    say: string;
    /// What the agent does with it, in a sentence or two.
    does: ReactNode;
    tools: string[];
  };
}
