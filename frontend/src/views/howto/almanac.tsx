// How the Almanac works.

import Term from "../../components/Term";
import type { Guide } from "./types";

export const almanac: Guide = {
  claim: "Degree days say what the season is doing to the plants. The Almanac says what the season is doing.",
  phenomenon: (
    <>
      <p>
        A grower reads a season by more than its heat: how humid the mornings
        run, how much rain fell and when the next is due, how much of the
        daylight was actually sunshine, which way the wind sat. Each is a
        measure with its own unit, so each gets its own small chart rather
        than a share of one crowded axis — degrees, inches and hours cannot
        share a scale honestly. The shape is the same across them so the eye
        learns it once: the grey band is the range of the last seasons here,
        the solid line is this season, the dashed line is the fortnight's
        forecast.
      </p>
      <p>
        Two of the measures are easily confused and sit beside each other on
        purpose. The <Term label="dew point" of="dew_point" /> is how much
        water the air holds; <Term label="humidity" of="humidity" /> is how
        close it is to holding all it can. The same water reads ninety per
        cent at dawn and fifty by noon because the air warmed, not because
        anything dried — and it is the hours near saturation that keep a leaf
        wet.
      </p>
      <p>
        Two more are astronomy rather than weather. <Term label="Day length" of="daylight" />
        {" "}and its change per day are computed exactly, and they are the
        clock migration runs on, which is why a robin's arrival barely moves
        between a warm year and a cold one. The moon's phase is the same kind
        of fact, and the next full moon is dated to the day.
      </p>
    </>
  ),
  facts: [
    ["One call, every measure",
      <>The whole page is one read of the almanac. The Dashboard's weather
        overlay shares it, so flipping between the two costs nothing extra.</>],
    ["Normal is local",
      <>The grey band is this ground's own last seasons, not a regional
        average — the number of seasons is printed under the charts.</>],
    ["Nothing is written",
      <>The Almanac reads. The only thing you change is the arrangement, and
        that is remembered on this device beside your season and your units.</>],
  ],
  using: [
    { emoji: "👀", heading: "Read", steps: [
      ["Today",
        <>Eight readings in eight equal cells: the sky with its high and low,
          dew point, wind with its direction, chance of rain, sunrise to sunset
          with the hours of daylight, hours of sunshine as a share of them, how
          much the day length is changing, and the moon.</>],
      ["🌧️ in the title row",
        <>Shows or hides the rain on the radar, now, over your ground. The map
          plays the last hour; the button under its zoom control enlarges it.
          Whether it is open is remembered on this device.</>],
      ["The spyglass",
        <>The ten days ahead against the record, in words — warmer or cooler
          than normal, wetter or drier, and the nights to watch. Every number
          is already on the page, so opening it asks for nothing.</>],
      ["The fortnight",
        <>Fourteen cards, one per day: sky, high and low, chance of rain,
          humidity and wind. Each card rides a few pixels higher on a warmer
          day, so the week's warming or cooling shows before a number is read.</>],
      ["The season so far",
        <>One chart per measure you have switched on. Grey band, solid season,
          dashed forecast. The button in each chart's corner takes it to the
          whole screen; Escape brings it back.</>],
    ]},
    { emoji: "✏️", heading: "Arrange", steps: [
      ["The chiclets",
        <>One per measure. Tap to show or hide its chart. Drag one along the
          row to move its chart up or down the page — left to right here is top
          to bottom below. A press that never travels is a tap.</>],
      ["Units and season",
        <>Degrees, inches and the season's theme are set on the Account page
          and apply everywhere.</>],
    ]},
  ],
  agent: {
    lead: (
      <>
        The almanac is one tool that answers for every measure at once, so an
        agent asked any sky question reads it once and answers from the
        structure: today's conditions, the fortnight, each measure's season
        against its normal, and the sun and moon.
      </>
    ),
    say: "Is this a disease week on the Meadow? What's the dew point running, and when is the next dry stretch?",
    does: (
      <>
        Reads the almanac for the block and reports the dew point and humidity
        over the last days against normal, the rain in the fortnight and the
        first run of dry days. Asked specifically about a disease, it reads the
        disease risk tool instead, which counts the wet hours the models
        actually use.
      </>
    ),
    tools: ["goodearth_almanac", "goodearth_disease_risk", "goodearth_drying_window"],
  },
};
