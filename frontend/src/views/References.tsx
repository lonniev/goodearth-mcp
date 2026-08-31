// References — where every number on this site comes from.
//
// Good Earth sells answers about ground a grower will plant. That obliges it
// to be checkable: not "trust us", but here is the feed, here is what it
// resolves, here is the model applied on top and the assumption inside it.
//
// This page exists because the alternative is a confident interface whose
// workings are private, and a farmer who cannot audit an answer has to either
// believe it or ignore it. Neither is what they are paying for.

const SOURCES: {
  name: string; url: string; role: string; resolution: string; note: string;
}[] = [
  {
    name: "Open-Meteo — historical reanalysis (ERA5)",
    url: "https://open-meteo.com/en/docs/historical-weather-api",
    role: "Observed daily max/min, dew point, rain, wind, sunshine, soil temperature. Every season curve, frost record and heat budget rests on this.",
    resolution: "≈ 9 km",
    note: "Reanalysis, not a station reading. It is a model's best estimate of what the weather was, which is why two points on one farm return identical numbers.",
  },
  {
    name: "Open-Meteo — forecast",
    url: "https://open-meteo.com/en/docs",
    role: "The 7–16 day outlook: nightly lows, wind, cloud, precipitation chance, hourly soil temperature, sunrise and sunset.",
    resolution: "≈ 2–11 km by model",
    note: "The daily soil aggregates come back empty from this endpoint; only the hourly series is populated, so Good Earth asks hourly and averages.",
  },
  {
    name: "Open-Meteo — elevation (SRTM)",
    url: "https://open-meteo.com/en/docs/elevation-api",
    role: "Terrain height at each sample point. This is the ONLY feed that resolves within a single farm, so it carries the whole burden of region spread.",
    resolution: "≈ 90 m",
    note: "Finer than PRISM's 800 m, and a single batched JSON call.",
  },
  {
    name: "Esri World Imagery",
    url: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
    role: "Satellite basemap for drawing a block, and the ghosted still behind the season curve.",
    resolution: "sub-metre in most cultivated areas",
    note: "Imagery © Esri, Maxar, Earthstar Geographics.",
  },
  {
    name: "OpenStreetMap + Nominatim",
    url: "https://www.openstreetmap.org/copyright",
    role: "Street basemap, place search when finding a farm, and reverse geocoding to name the state for extension links.",
    resolution: "—",
    note: "© OpenStreetMap contributors.",
  },
  {
    name: "RainViewer",
    url: "https://www.rainviewer.com/api.html",
    role: "Weather radar frames on the map.",
    resolution: "≈ 2 hours of past frames",
    note: "Radar is an echo off real rain, so it cannot reach into tomorrow however a control is drawn. For the day ahead, the Almanac's forecast is the honest instrument.",
  },
  {
    name: "iNaturalist",
    url: "https://api.inaturalist.org/v1/docs/",
    role: "Species identification in event details, and importing your own observations into Field Reports.",
    resolution: "—",
    note: "Read-only. Importing your observations is a courtesy; posting on your behalf is not something this does.",
  },
];

const MODELS: { title: string; body: string; assumption: string }[] = [
  {
    title: "Growing degree days",
    body: "Daily mean above a base temperature, by the standard averaging method: both bounds are clamped to the base before averaging, and to an upper threshold when a crop has one.",
    assumption: "A night twenty degrees below base does not un-grow the plant, so the negative half must not cancel a warm afternoon. Days missing a bound contribute nothing and the total carries forward flat — a gap reads as a pause, not a dip.",
  },
  {
    title: "Region spread — the lapse rate",
    body: "Temperature falls about 6.5 °C per kilometre of elevation, which is 3.57 °F per thousand feet. Applied to both the daily maximum and minimum at each sample point, relative to the elevation the coarse feed believes its cell sits at.",
    assumption: "The standard environmental lapse rate holds on a mixing day. It is a physical model, not a measurement of your farm.",
  },
  {
    title: "Region spread — cold-air drainage",
    body: "On still, clear nights dense cold air slides downhill and pools in low ground. Applied to the daily MINIMUM only, scaled by how far a point sits below the region's high ground, and capped.",
    assumption: "A calm, clear night INVERTS the profile — the hollow is colder than the bench, not warmer. The daytime lapse rate has no business opposing this term. The coefficient is conservative and first-principles; your farm's real inversion depends on its shape and its outlet, which is exactly what field reports calibrate.",
  },
  {
    title: "Frost risk",
    body: "The forecast low is a grid-cell average. Wind speed and cloud cover decide how much stratification to expect, and that fraction of the drainage term is subtracted to give the coldest ground.",
    assumption: "Frost is radiative. Wind mixes the air away; cloud puts a lid on the radiation. Missing wind or sky is assumed to be a middling night — never a safe one.",
  },
  {
    title: "First frost dates",
    body: "The first day on or after 15 July with a minimum at or below 32 °F, in each of the last ten seasons at the region centroid. Reported as median, earliest and latest.",
    assumption: "Dates are compared by calendar day rather than day-of-year, because a leap year shifts every autumn date by one and 6 October is 6 October to a farmer.",
  },
  {
    title: "Soil crossings",
    body: "The first date the soil holds the new side of a threshold for five consecutive days, searched only within the half of the year the crossing belongs to.",
    assumption: "A one-day dip is weather, not a season turning. Both rules are needed: a five-day cool spell in June is real and is still not the autumn crossing.",
  },
  {
    title: "Projections",
    body: "Past the forecast horizon, accumulation is carried forward at the last fortnight's average rate.",
    assumption: "This is NOT a forecast. It answers 'if the season keeps behaving as it has been', which is the question behind a target date. The further out you read it, the more it is a sketch.",
  },
  {
    title: "Heat budget for suitability",
    body: "Heat accumulated between last spring frost and first fall frost, median across the last eight seasons, at each crop's own base temperature.",
    assumption: "Counting from 1 January would credit ground with heat arriving before anything can be planted into it. And a crop that finishes on the last warm day of an average year fails in half of them, so exactly-enough is reported as marginal rather than as a pass.",
  },
  {
    title: "Calibration",
    body: "Your field reports against what the model predicted. Crop stages give a bias in heat; observed frost gives a bias in days. Median, never mean.",
    assumption: "Nothing is applied below three agreeing observations, and implausible values are set aside rather than averaged in. One observation is an anecdote, and a mis-entered date must not be able to rewrite a block's calendar.",
  },
  {
    title: "Sun and moon",
    body: "Day length from solar declination and the hour angle, including the standard −0.833° correction for refraction and the sun's disc. Moon phase from the synodic month against a known new moon.",
    assumption: "None. This is astronomy — computed exactly, never fetched, and as knowable next March as it is today.",
  },
];

export default function References() {
  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">References</h1>
        <span className="text-[13px] text-ink-soft">where every number comes from</span>
      </div>

      <p className="mb-6 max-w-prose text-[13px] leading-relaxed">
        Good Earth sells answers about ground you are going to plant. That
        obliges it to be checkable — not "trust us", but here is the feed, here
        is what it resolves to, and here is the model applied on top with the
        assumption inside it. A grower who cannot audit an answer has to either
        believe it or ignore it, and neither is what you are paying for.
      </p>

      <h2 className="figure mb-2.5 text-[18px] font-semibold">🛰️ Data sources</h2>
      <p className="mb-3 text-[12.5px] text-ink-soft">
        All free and public. No key is required for any of them, which is part
        of why an answer here costs a few sats rather than a subscription.
      </p>
      <div className="space-y-2.5">
        {SOURCES.map((s) => (
          <div key={s.name} className="rounded-md border border-rule bg-panel px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <a href={s.url} target="_blank" rel="noreferrer"
                className="figure text-[15px] font-semibold text-ink underline decoration-rule underline-offset-2">
                {s.name}
              </a>
              <span className="data rounded-full bg-band px-2 py-0.5 text-[10.5px] text-ink-soft">
                {s.resolution}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed">{s.role}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{s.note}</p>
          </div>
        ))}
      </div>

      <h2 className="figure mt-8 mb-2.5 text-[18px] font-semibold">📐 Models and their assumptions</h2>
      <p className="mb-3 max-w-prose text-[12.5px] text-ink-soft">
        Every prediction here is a feed plus a model. The model is where the
        error lives, so it is stated rather than hidden.
      </p>
      <div className="space-y-2.5">
        {MODELS.map((m) => (
          <div key={m.title} className="rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
            <h3 className="figure text-[15px] font-semibold">{m.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed">{m.body}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
              <span className="eyebrow mr-1.5">Assumption</span>{m.assumption}
            </p>
          </div>
        ))}
      </div>

      <h2 className="figure mt-8 mb-2.5 text-[18px] font-semibold">🚫 What Good Earth will not tell you</h2>
      <div className="rounded-md border border-rule border-l-4 border-l-clay bg-panel px-4 py-3.5 text-[13px] leading-relaxed">
        <p>
          <b>It does not publish agronomy, entomology or natural history.</b>{" "}
          Crop targets, pest thresholds and wildlife triggers are yours — the
          starter lists are shapes to edit. A corn hybrid is sold by its
          relative maturity precisely because "corn" has no single number, and
          a degree-day threshold right for one valley is wrong in the next.
        </p>
        <p className="mt-2">
          <b>It never recommends a treatment.</b> Pesticide registration is
          state-specific and changes annually; a label rate is law rather than
          guidance. Event details route you to the extension service and IPM
          center whose bulletin is authoritative where you farm, and say plainly
          that their word counts and this screen's does not.
        </p>
        <p className="mt-2">
          <b>It does not hide a projection behind a date.</b> Anything past the
          forecast horizon is labelled as carried forward at the recent rate,
          everywhere it appears.
        </p>
      </div>

      <p className="mt-6 max-w-prose text-[12px] leading-relaxed text-ink-soft">
        Found something here that disagrees with your own record? That is the
        most useful thing you can tell it. File a field report — the calibration
        loop turns a disagreement into a correction for your block, which is the
        one part of this that gets better the longer you use it.
      </p>
    </>
  );
}
