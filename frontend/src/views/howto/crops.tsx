// How Flora works.

import Term from "../../components/Term";
import type { Guide } from "./types";

export const crops: Guide = {
  claim: "A planting is a crop, a heat target and a day it went in. From those three, this ground says whether it finishes before frost.",
  phenomenon: (
    <>
      <p>
        Every annual has a figure on its packet or in a trial — the{" "}
        <Term label="degree-day target" of="gdd_target" /> it needs from{" "}
        <Term label="set-out" of="set_out" /> to harvest. Count this ground's
        heat from the day it went in and the target becomes a date; set that
        date against the median first frost and the planting either finishes,
        finishes tight, or will not finish outdoors here. The margin is the
        answer that matters: a crop that finishes on the last warm day of an
        average year fails in half of them.
      </p>
      <p>
        A perennial is asked different questions, both settled before it goes
        in. Will it survive — how often, in the winters on record, did the
        coldest night go below its <Term label="hardiness" of="hardiness" />{" "}
        limit? Will it fruit — how many winters delivered its{" "}
        <Term label="chill hours" of="chill_hours" />, counted between 32 and
        45 °F from November to mid-February? A tree with neither figure is
        recorded as present and reported as unrated, never refused.
      </p>
      <p>
        Heat says whether a plant <i>can</i> finish. It says nothing about when
        to start, which is the decision made with a seed packet in February.
        The planting window answers that from the block's own frost and soil:
        when seed goes in under lights, when the plant can go out, and the last
        day a sowing still beats the frost — counting September's slower heat
        rather than July's. A <Term label="succession" of="succession" /> is
        that last question asked every so many days.
      </p>
      <p>
        Companions come in two kinds and the page keeps them apart. Synergy is
        published rule — nitrogen fixers beside heavy feeders, alliums that
        mask a carrot from its fly, walnut that poisons the ground beside it —
        each row with its mechanism and a citation. Design is arithmetic over
        what you wrote down about colour, height and bloom months.
      </p>
    </>
  ),
  facts: [
    ["The figures are yours",
      <>Nobody publishes a cultivar's heat target. Good Earth computes against
        the number you give it and never invents one you did not.</>],
    ["One read for the block",
      <>The ledger is one call for every planting on it. Adding a ninth row
        costs arithmetic, not another round trip.</>],
    ["Presence is a real state",
      <>A plant with no target and no date is on the ledger as present — an
        apple planted in 2019 has neither. Dates and targets are yours to add.</>],
  ],
  using: [
    { emoji: "➕", heading: "Add a planting", steps: [
      ["Species",
        <>Type a name and pick it from the list — iNaturalist's plants and
          fungi, with a photograph. A shiitake belongs here: it is raised,
          fruits and is picked.</>],
      ["Your name for it",
        <>Optional. "Zinnia · succession 4" is how you will find the row again;
          the catalogue's common name stands in when you leave it blank.</>],
      ["GDD target · Planted · Base",
        <>The three facts the ledger paces a planting by. Leave the target
          blank for a tree or anything you are not pacing — that is how a
          perennial is entered. Base blank takes the block's.</>],
      ["Flower · Height · Blooms",
        <>Optional, for Design companions. A planting without them is simply
          not paired by colour.</>],
      ["Handles Light Frost · Sap Producer",
        <>Frost-hardy lets a planting use the shoulder before the last frost.
          A sap producer puts the block's sap run on the tree year.</>],
      ["+ Planting",
        <>Writes the row. One press, one row: the button is held until the
          write lands, and a failure leaves the form as you left it.</>],
      ["Community Observations",
        <>What people have recorded growing near here, most-seen first —
          plants or fungi. Search, tick any number, keep searching, then add
          them all in one write. They land as presence rows.</>],
    ]},
    { emoji: "📒", heading: "Read the ledger", steps: [
      ["The heading",
        <>Carries the time the ledger was read. The filter asks four
          questions — ready before frost, has seed, projected within so many
          days, heat left under so much — and the search takes a regular
          expression and runs when you submit it, not per keystroke.</>],
      ["The columns",
        <>Tap a header to sort by it; the database sorts every planting on the
          block, not the twenty in hand. Twenty to a page; the pager counts the
          block. While a filter is on, the whole block is read and the pager
          stands down.</>],
      ["A row",
        <>The bar is heat to target, not calendar progress. The chips say where
          it stands — not yet out, on pace, stalled, past target — and the
          verdict: finishes, won't finish, done. A disease model that names this
          crop shows its status beside it. A cut recorded this season shows
          what the planting gave.</>],
      ["🔄 Rotation — What grew here?",
        <>Every planting on this plot, season by season and grouped by plant
          family, the cleared ones included. Tap one to plant it again: the form
          fills with its figures and you choose the day.</>],
      ["🌾 Grows here",
        <><b>🧠 What?</b> rates every heat-target planting against the block's
          frost-free days and the heat inside them — ✓ comfortable, ⚠ tight, ✕
          will not finish. <b>🌳 Trees?</b> rates the perennials on winters
          survived and chill delivered. <b>🍁 This year?</b> dates this spring's
          first leaf and bloom against normal and counts the sap days.</>],
      ["🌱 When to sow — 🧠 When?",
        <>Per planting: seed indoors, out, last sowing, and the window between.
          A tender plant's "out" is the median last frost — a coin toss, not a
          green light. Choose <b>every 7–28 days</b> on a row for a succession
          schedule, then add the whole plan to the ledger in one write.</>],
    ]},
    { emoji: "✏️", heading: "Change", steps: [
      ["Tap a row",
        <>Opens it for editing where it sits. Enter saves, Escape abandons.</>],
      ["Seed",
        <>The packets of this plant on the shelf: add a lot with its variety,
          days to maturity and germination; bind a sowing to a packet and a
          day. A packet with no plant on the ledger is listed under the table
          with a way to add the plant.</>],
      ["Record a harvest",
        <>A cut or a pick, with an amount and a unit. It goes to the record as
          an observation; the first cut of a planting is the stage its target
          predicted and teaches the model, later cuts are yield.</>],
      ["Companions",
        <>🤝 Synergy or 🎨 Design for this planting, grouped by where they go.
          Tap a companion to send it to the form — the day it goes in is yours
          to choose, and so is whether it goes in at all.</>],
    ]},
    { emoji: "🗑️", heading: "Remove", steps: [
      ["The bin",
        <>Takes the row off the ledger. The record retires it rather than
          deleting it: the undo mark that appears in the top bar names the row
          and puts it back under the same id. It stays in Rotation as something
          that grew here.</>],
    ]},
  ],
  agent: {
    lead: (
      <>
        A planting written by an agent is a row on this ledger, and the
        questions the page asks with buttons an agent asks with tools: where
        each stands, what finishes, when to sow, what grew here. Batches are the
        point — an afternoon's planning is one write, not a row per call.
      </>
    ),
    say: "Put six zinnia successions on the Meadow, every 14 days from May 20, 1,100 GDD each — and tell me which ones finish before frost.",
    does: (
      <>
        Saves six planting rows in one write, each with the crop, its target
        and its set-out, then reads the crop ledger for the block and reports
        each sowing's projected finish against the median first frost — which
        of the six finish, which are tight, and the last one worth the seed. It
        can first ask the planting window for the succession schedule rather
        than counting the days itself.
      </>
    ),
    tools: [
      "goodearth_block_item_save", "goodearth_crop_gdd_status", "goodearth_planting_window",
      "goodearth_crop_suitability", "goodearth_tree_suitability", "goodearth_companions",
      "goodearth_block_item_list",
    ],
  },
};
