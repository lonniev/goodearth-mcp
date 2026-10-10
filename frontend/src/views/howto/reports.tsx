// How Field Reports works.

import Term from "../../components/Term";
import type { Guide } from "./types";

export const reports: Guide = {
  claim: "Every other page answers from a model of the weather. A field report measures the gap between the model and this ground.",
  phenomenon: (
    <>
      <p>
        The weather behind every answer here is a nine-kilometre grid, refined
        by a physical model of the terrain inside your block. What that cannot
        know is the part that makes a farm particular: the hedgerow that
        breaks the wind, the pond that holds the night's warmth, the outlet
        the cold air drains through. A report of what the ground actually did
        — frost on the fourth, zinnias blooming on the twelfth — measures
        exactly that gap, and enough of them turn the grid into this block's
        own calendar.
      </p>
      <p>
        Two corrections come out, kept apart because they fix different
        things. A bias in <i>heat</i>, from crop stages: a planting that
        reached its target early or late says this ground accumulates more or
        less than the grid credits, as a percentage. A bias in <i>days</i>,
        from observed frost: this ground frosts earlier or later than the
        region. Nothing is applied silently. A correction appears only once
        several observations agree, an implausible value is set aside rather
        than averaged in, and the confidence climbs from provisional through
        early and firming to settled as the record grows.
      </p>
      <p>
        Only some reports can teach. The model has to have predicted the
        thing for an observation to measure a gap, so a first bloom or an
        emergence calibrates when it carries the planting's set-out and the
        target it was expected at; a frost calibrates on its own; a pest
        sighting or a note is kept, and corrects nothing. A harvest recorded on
        Flora counts too — the first cut of a planting is the stage its target
        predicted.
      </p>
    </>
  ),
  facts: [
    ["Applied to your ground",
      <>Once a correction stands, every answer for the block — the curve, the
        frost date, the planting window — is shifted by it.</>],
    ["Location is offered",
      <>A report files without one. Pinning where you stood lets a hollow and
        a bench on the same block tell different stories.</>],
    ["Your own sightings",
      <>Observations you logged on iNaturalist inside this plot's boundary
        can be brought in; a flowering annotation becomes a bloom report.</>],
  ],
  using: [
    { emoji: "➕", heading: "File one", steps: [
      ["The tags",
        <><b>Frost</b>, <b>First bloom</b>, <b>Emergence</b>, <b>Pest seen</b>,{" "}
          <b>Note</b> — or type what you saw. Only frost and the stage kinds
          reach the model; everything else is recorded either way.</>],
      ["Seen on",
        <>Today, unless you say otherwise.</>],
      ["Crop",
        <>Asked for a bloom, an emergence or a pest: which planting it was.</>],
      ["Set out · Expected at (GDD)",
        <>Asked for the two calibrating stages. The day it went in and the{" "}
          <Term label="target" of="gdd_target" /> it was expected at are what
          turn a date into a measurement of the model.</>],
      ["Here",
        <>Asks the device once for where you are standing and pins it to the
          report. Offered, never demanded.</>],
      ["Observation",
        <>Files it. On a tablet in a field, a tag is one tap and the date is
          today, and nothing else is required.</>],
    ]},
    { emoji: "🔭", heading: "Import from iNaturalist", steps: [
      ["Your handle",
        <>Your iNaturalist login, not your email; the box suggests matching
          handles as you type. Remembered on this device under your npub.</>],
      ["Search",
        <>Lists your observations since the start of last year that fall
          inside this plot's boundary — the drawn ring, not a box round it — and
          says how many nearby fell outside. It writes nothing.</>],
      ["Import n selected",
        <>Files the ticked rows. Flowering annotations are ticked already and
          become first-bloom reports; the rest become notes. A bloom still needs
          its set-out and expected GDD before it can teach — add those on the
          rows that matter.</>],
    ]},
    { emoji: "👀", heading: "Read what it learned", steps: [
      ["Your Observations",
        <>Two cards: the heat bias as a percentage and the first-frost bias in
          days, each with its confidence and the reports behind it, and the
          correction applied to your ground once one stands. Implausible
          reports are counted as set aside.</>],
      ["Log",
        <>Every report, newest first, with how many of them are teaching the
          model. A report filed without signal shows ⇡ until it goes.</>],
    ]},
    { emoji: "🗑️", heading: "Remove", steps: [
      ["The bin",
        <>Retires a report. The calibration reads again without it.</>],
    ]},
  ],
  agent: {
    lead: (
      <>
        A report is a date, a tag and whatever you saw, and an agent can file
        one from a sentence. It can also ask what the record has learned, or
        try a set of observations against the model without recording them —
        and have the roster review flag an observation that cannot be right
        before it degrades every later answer.
      </>
    ),
    say: "Frost on the Meadow this morning, October 2nd, patchy in the hollow — record it, and tell me what it does to the first-frost date.",
    does: (
      <>
        Saves the observation on the block with the date, the frost tag and
        the note, then reads the calibration for the block and reports the
        first-frost bias with its confidence and how many frost reports it
        rests on — and whether a correction is now applied. Asked to check a
        date before filing it, it passes the observation to the review instead.
      </>
    ),
    tools: [
      "goodearth_block_item_save", "goodearth_calibration", "goodearth_review_roster",
      "goodearth_block_item_list",
    ],
  },
};
