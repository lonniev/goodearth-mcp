// How Pests works.

import Term from "../../components/Term";
import type { Guide } from "./types";

export const pests: Guide = {
  claim: "An insect is on the same clock as the crop it eats. Count its heat from the day it starts and its next stage is a date.",
  phenomenon: (
    <>
      <p>
        A codling moth does not know the date. It knows how warm it has been
        since it started counting — from the first sustained trap catch, its{" "}
        <Term label="biofix" of="biofix" />, or from the first of January when
        nobody set one. Each life-cycle event arrives at a{" "}
        <Term label="threshold" of="threshold" />: first flight at so many
        degree days, egg hatch at so many more. Count this ground's heat above
        the pest's own <Term label="base" of="base_temp" /> — 50 °F for the
        codling moth, 40 °F for the cabbage maggot on the same acre — and each
        threshold becomes a date, which is the week to walk the rows.
      </p>
      <p>
        The thresholds are yours. The authoritative figures are in your
        extension service's bulletins and vary by region and biotype, so Good
        Earth times them on your ground and does not publish entomology. Where
        USA-NPN publishes a degree-day model for these coordinates, the page
        dates it for you; a vole, a slug or a chipmunk has no model and is
        simply watched.
      </p>
    </>
  ),
  facts: [
    ["Three shapes of pest",
      <>Your own thresholds from a bulletin; a published model, cited rather
        than retyped; or a creature watched all season with no model at all.</>],
    ["Active now",
      <>The panel at the top is the week's answer: which pests have a stage
        due or just crossed, so the walk is a short one.</>],
    ["No treatment",
      <>A pesticide label is law and changes yearly. The page times the pest
        and hands you to the extension service that is authoritative here.</>],
  ],
  using: [
    { emoji: "➕", heading: "Watch a pest", steps: [
      ["Pest",
        <>Type a name and pick it from the catalogue of animals — a chipmunk
          and a slug are pests too. A typed name iNaturalist has not heard of
          still stands; "pest" is your word for whatever is eating the crop.
          The small book opens the creature's card to check it is the right one.</>],
      ["Base",
        <>The temperature its count runs above. Blank takes the block's own,
          which is what the season curve is accumulated from.</>],
      ["Biofix",
        <>The day the count starts — usually the first sustained trap catch.
          Blank runs it from the first of January.</>],
      ["Stages",
        <>Life-cycle events and the degree-day total each arrives at, comma
          separated: <i>first flight 375, second flight 1400</i>. Leave it
          empty to just watch the creature.</>],
      ["The bug button",
        <>Writes the row. One press, one row.</>],
      ["🐛 When they appear here — What's here?",
        <>USA-NPN's published models dated for this ground, as chiclets: 🥚
          still to come, 🐛 passed. Tap one to name that pest in the form; the
          numbers stay blank and yours to set.</>],
      ["Community Observations",
        <>Insects and spiders people have actually recorded near here. Search,
          tick, add them all — they go on as watched, with no thresholds.</>],
    ]},
    { emoji: "👀", heading: "Read what you're watching", steps: [
      ["Active now",
        <>The short list to go and look for this week.</>],
      ["The heading",
        <>The time the models were read. The filter asks three questions —
          due within so many days, crossed this season, watched with no model —
          and the search takes a regular expression, run on submit.</>],
      ["The columns",
        <>Pest, Biofix, degree days to date, and Stages. Three of the four are
          terms of art; the ⓘ beside each defines it. Sort by pest or biofix;
          the accumulation is computed for the page in hand and is not a column
          to sort by.</>],
      ["A row",
        <>The glyph says its state: 👁️ watched, 🥚 a stage still pending, 🐛
          every stage crossed. Each stage chip is filled with the date it was
          crossed, or shows the projected date — or the degree days to go when
          the projection runs past the forecast. A row the service could not
          evaluate says <i>no thresholds — tap to set</i>.</>],
    ]},
    { emoji: "✏️", heading: "Change", steps: [
      ["Tap a row",
        <>Opens it where it sits: name, base, biofix and the stages in the same
          comma-separated grammar as the form. Enter saves, Escape abandons. A
          stage you leave unparsed is kept rather than dropped.</>],
    ]},
    { emoji: "🗑️", heading: "Remove", steps: [
      ["The bin",
        <>Retires the row. The undo mark in the top bar names it and puts it
          back.</>],
    ]},
  ],
  agent: {
    lead: (
      <>
        A pest model is a small record — a name, a base, a biofix and a list of
        stages — and an agent can save one from a bulletin you paste and then
        ask where it stands. It can also audit the list: which pests on it this
        ground's record does not know, and which it knows well that the list
        leaves out.
      </>
    ),
    say: "Watch aster leafhopper on the Meadow from May 1 at base 50, with second flight at 1,850 — when is it due, and what else should I be scouting for this week?",
    does: (
      <>
        Saves the pest row on the block, reads the thresholds for every pest
        on it and reports the projected date of the second flight with the heat
        banked since the biofix, then returns the scout-now list. Asked whether
        the roster is right, it reviews it against the models USA-NPN
        publishes here and the insects recorded nearby.
      </>
    ),
    tools: [
      "goodearth_block_item_save", "goodearth_pest_threshold", "goodearth_pest_catalog",
      "goodearth_review_roster", "goodearth_nearby_species",
    ],
  },
};
