// How My Plots works.

import Term from "../../components/Term";
import type { Guide } from "./types";

export const plots: Guide = {
  claim: "A farm is not a pin. It is ground with a shape, and the shape decides the weather on it.",
  phenomenon: (
    <>
      <p>
        Cold air is heavier than warm. On a still, clear night it drains off
        the high ground and pools in the hollows, so a bench and a hollow on the
        same acreage do not share a frost date — or a first bloom, or a day the
        soil is warm enough to sow. A south-facing slope takes the sun square
        on; a north one takes it at a slant. A hedgerow on the west shades the
        bed beside it for an hour at dusk, and the stand of maples beyond it
        shades nothing in April and everything in July.
      </p>
      <p>
        So every answer here is asked of a <Term label="block" of="block" />:
        ground you drew or pinned, saved once under a name. Good Earth samples
        the terrain inside it — a few metres apart on a bed, ninety metres
        apart on a hayfield — and answers with an aggregate <i>and</i> the{" "}
        <Term label="spread" of="spread" /> across it. Blocks may overlap or
        sit inside one another: the whole farm, the meadow within it, a trial
        strip across two beds. Each is a question about some ground, not a
        parcel on a survey.
      </p>
      <p>
        The Sun layer goes further. From every cell it casts the line of the
        sky — the terrain out to twenty kilometres, the trees within two
        hundred and fifty metres — and counts the hours on the fifteenth of
        each month when the sun stands above that line. Bare deciduous crowns
        pass half the beam, and a month is in leaf when this ground's own
        record says so.
      </p>
    </>
  ),
  facts: [
    ["Geometry travels once",
      <>Save the shape here and every other page asks for the block by name.
        Nothing is redrawn on each call.</>],
    ["Measured, not typed",
      <>Area and sample count are read off the shape you drew. They are facts
        about the geometry, with nothing to keep in step.</>],
    ["Forgetting is soft",
      <>A forgotten plot leaves every page but stays on the record. Save it
        again and it is back, with everything recorded on it.</>],
  ],
  using: [
    { emoji: "➕", heading: "Add ground", steps: [
      ["+ Add a plot",
        <>Opens the finder, the form and the drawing map. They open on their
          own for a grower with no plots yet, and fold away once one is saved.</>],
      ["Find a town, road or address · Use my location",
        <>Centres the drawing map. Search by a nearby town if the farm itself
          is not on the map's index; the location button asks the device once.</>],
      ["Trace a block",
        <>Click each corner in turn; drag a corner to fix it; <b>Undo
          corner</b> takes the last one back and <b>Start over</b> clears the
          lot. Three corners make a block. Saved plots show faintly so a new one
          can be placed beside them.</>],
      ["Pin + radius",
        <>Click the middle of the block and pick a radius from 200 m to
          3.2 km, for ground that is more a place than a shape.</>],
      ["Name · Base",
        <>The name every page will call it by. The{" "}
          <Term label="base" of="base_temp" /> is the temperature its season
          curve counts from — 50 °F for most vegetables, lower for brassicas
          and winter grains. Each planting can carry its own later.</>],
      ["Save",
        <>Writes the block to your record, measures it, and switches every
          view to it. The area is shown before you press it.</>],
      ["Import",
        <>Opens a farm bundle somebody shared with you — a file of their plot
          and this season's plantings, pests, fauna and tasks. It becomes a new
          plot of yours on the same ground; none of your plots change. A large
          file is asked about before it is opened, never refused.</>],
    ]},
    { emoji: "👀", heading: "Read and switch", steps: [
      ["The chips",
        <>One per plot, with its area. Tap one to work it: the top bar's name
          changes and every page answers for that ground from then on. The
          active chip carries a small eye — tap it again to frame the plot on
          the map.</>],
      ["The map",
        <>All your plots on one map; tap a plot to work it. The button in
          the top right corner enlarges the map to the whole screen; the same
          button, or Escape, brings it back.</>],
      ["The line under the map",
        <>The plot being worked, in its numbers: shape, corners or radius,
          hectares, how many samples the service takes across it, and its base.</>],
      ["The Sun button",
        <>Turns the Sun layer on. The first call on a block casts its horizon
          and takes some seconds; after that every change below is arithmetic.
          The strip under the map chooses <b>Garden</b> or <b>Solar</b>, the
          month, and whether the trees are in leaf. Tap inside the plot for that
          spot's hours; the summary names the sunniest and shadiest ground and,
          in Solar, the best place and tilt for a panel. A tap also lays an
          array on the spot: drag its corner or type its metres, and the card
          prices it — what it costs to put up, the kWh it makes a day, and
          what those sell for — from the day's DOE benchmark and your state's
          EIA tariff, read live, or the rate you type.</>],
    ]},
    { emoji: "✏️", heading: "Change", steps: [
      ["The pencil",
        <>Renames the plot being worked and sets the other names it answers
          to. An alias is only needed for a name that shares no words with the
          saved one — "North Farm" already finds "North Farm (east parcel)".</>],
      ["Share",
        <>Packs the plot and this season's record into a farm bundle and hands
          it to the share sheet, or downloads it. On some devices the sheet
          wants a second tap; the card says so.</>],
    ]},
    { emoji: "🗑️", heading: "Remove", steps: [
      ["The bin",
        <>Forgets the plot being worked, after asking. It is the one act on
          this site whose reach is bigger than the thing tapped — every crop,
          pest, watch and report recorded on it leaves every view at once —
          which is why it asks where a row does not. Nothing is deleted: saving
          the plot again brings it all back.</>],
    ]},
  ],
  agent: {
    lead: (
      <>
        Ground saved by an agent is the same record this page shows. An agent
        can take a polygon you paste, a pin and a radius, or a description it
        resolves to coordinates, and save it as a block; it then names the block
        on every later call rather than sending the shape again.
      </>
    ),
    say: "Save my north meadow as a block — here are its four corners — base 50, and call it “Meadow” as well. Then tell me how many hours of sun it gets in July.",
    does: (
      <>
        Saves the block with the polygon, the base and the alias, reads back the
        measured area and sample count, then asks the Sun layer for July and
        reports the share of the meadow in full sun, part shade and full shade
        with the sunniest spot's coordinates. To retire a block it saves the
        same block again with <code>retired</code> set, which is what Forget
        does here.
      </>
    ),
    tools: ["goodearth_block_save", "goodearth_block_list", "goodearth_sunlight"],
  },
};
