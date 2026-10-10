// How the Dashboard works.

import Term from "../../components/Term";
import type { Guide } from "./types";

export const ledger: Guide = {
  claim: "The season is measured in warmth, and this page is where it stands today — on your ground, against ten years of it.",
  phenomenon: (
    <>
      <p>
        A plant does not count days; it counts the warmth above the
        temperature it grows at. Each day adds the degrees its mean ran above
        the block's <Term label="base" of="base_temp" />, never below zero, and
        the running total is the season in{" "}
        <Term label="growing degree days" of="gdd" />. The curve on this page is
        that total since the first of January, drawn solid where it has
        happened, dashed for the week's forecast, and thin beyond that at the
        season's recent rate. The grey band behind it is the range of the last
        ten seasons on this same ground, so the eye reads at once whether this
        year runs warm or cool, and by how much.
      </p>
      <p>
        The curve is the block's mean. The{" "}
        <Term label="spread" of="spread" /> beside it is the gap between the
        coolest sample and the warmest, restated as the days they are apart at
        the current rate — which is what decides whether one planting date
        serves the whole block.
      </p>
      <p>
        Four trends sit under the chart because each runs on a clock heat does
        not keep. Frost forms on still, clear nights when cold air drains into
        the hollows, so the frost card reads the <i>coldest</i> ground rather
        than the average. Soil lags the air by weeks and is the steadier
        signal for a clove or a seed. Drying is the morning's dew burning off
        and how hard the air pulls water out of anything wet. And a fungus
        counts hours the leaf stays wet, not degrees — a hot dry August banks
        heat all month and grows no botrytis.
      </p>
    </>
  ),
  facts: [
    ["Nothing here is written",
      <>The Dashboard reads. What it marks on the curve — crops, pests, fauna,
        tasks — is changed on those pages.</>],
    ["Every reading says when",
      <>The small clock beside each answer is when it was read, and tapping it
        says which feed answered and at what resolution.</>],
    ["The pulse has a gauge",
      <>Under the season's total, a mark on a bar shows where this year sits
        between the coolest and warmest of the ten on record.</>],
  ],
  using: [
    { emoji: "👀", heading: "Read the season", steps: [
      ["The chips by the title",
        <>The two dials you set — the base and the season's start — and the
          sampling across your ground. <b>sources ↗</b> opens the page that
          names every feed.</>],
      ["The pulse strip",
        <>Five figures: heat so far with its gauge; the spread across the
          block, in GDD and in days; how far ahead of or behind the recent
          seasons, with the grid the band was read from; the median first frost
          and the earliest on record; and the coldest ground in the coming week
          against the plain forecast.</>],
      ["The chart",
        <>Drag or pinch to move along the season; the glasses on the left zoom
          the heat axis. The frost line stands at the median first frost. A
          wash across the date axis is a wet period a disease model found, past
          or forecast. The button in the corner takes the chart to the whole
          screen; Escape brings it back.</>],
      ["🛰️ Ground",
        <>Ghosts a satellite still of your block behind the curve, so the
          numbers stay attached to the place.</>],
      ["🔔 Events",
        <>Your crops' targets, pests' stages, fauna events and tasks, each
          placed where its figure meets this curve — or on its date, for a task
          or a day-length event. A mark drawn hollow is past the projection and
          sits on the typical year instead. Tap a mark to open it.</>],
      ["An opened event",
        <>Two halves. The timing is read off the page — whether the date is
          recorded, forecast or projected, and so how far to trust it. The
          identity is fetched: the scientific name, a cited summary, a
          photograph. What it never offers is a treatment; it names your
          jurisdiction and the extension service whose bulletin is the
          authority there.</>],
      ["🌦️ Weather",
        <>Lays one weather reading behind the curve — rain, high, low, dew
          point, sunshine, wind — and cycles to the next on each tap; tap past
          the last to clear it. The almanac is read once, on the first tap, and
          shared with the Almanac page.</>],
      ["find an event",
        <>Type part of a mark's name and the chart centres on it. A local
          search over marks already on the page; nothing is fetched.</>],
    ]},
    { emoji: "🔔", heading: "The trends", steps: [
      ["❄️ Freezing",
        <>Night by night for the coming week: the forecast low, the low on
          your coldest ground, and a level from clear to a hard freeze. The
          skep in the rail reads the same nights.</>],
      ["🪱 Soil Temp",
        <>The autumn cooling window at planting depth — when the soil crosses
          60 °F, the garlic question — from the near forecast and from when it
          normally happens here.</>],
      ["🌾 Drying",
        <>One line: when the dew is off this morning and tomorrow, the first
          run of dry days ahead, and the next hour of rain.</>],
      ["🍄 Diseases",
        <>Five published models against the crops on your ledger, each
          reading <b>forecast</b>, <b>recent</b> or <b>clear</b>. Wetness is
          estimated from modelled humidity and rain, never measured, and every
          answer says so.</>],
      ["More Views",
        <>Doors to the pages that answer the questions this one raises.</>],
    ]},
    { emoji: "✏️", heading: "Change what it shows", steps: [
      ["The marks",
        <>Add or edit a planting on Flora, a pest on Pests, a watch on Fauna,
          a task on Tasks. The Dashboard picks them up on its next read.</>],
      ["The base and the start",
        <>The base is the block's, set on My Plots. The season starts on the
          first of January; a planting's own count starts on its set-out.</>],
    ]},
  ],
  agent: {
    lead: (
      <>
        Each card on this page is one tool, and an agent can ask for any of
        them alone. The headline is the season curve; the rest are read beside
        it only when the question calls for them, so a frost question costs a
        frost read and nothing else.
      </>
    ),
    say: "Where does the season stand on Frogdale, and is there frost coming this week on the low ground?",
    does: (
      <>
        Reads the season curve for the block and reports the heat so far, the
        spread across it and how it sits against the ten-season band; then
        reads the frost window and reports the median first frost and the
        coldest night ahead with its level. Asked about a clove going in, it
        adds the soil projection; asked whether it is a disease week, the
        disease risk; asked whether the flowers will be dry by nine, the
        drying window.
      </>
    ),
    tools: [
      "goodearth_gdd_season_curve", "goodearth_frost_window", "goodearth_soil_temp_projection",
      "goodearth_disease_risk", "goodearth_drying_window", "goodearth_almanac",
    ],
  },
};
