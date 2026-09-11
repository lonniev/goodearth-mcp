// References — the feeds and the models, as a list you can scan.
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
    name: "Daymet v4 — daily surface weather (NASA ORNL)",
    url: "https://daymet.ornl.gov/",
    role: "Past seasons for the normal band: the ten-season record every 'ahead of normal' reading is measured against.",
    resolution: "1 km",
    note: "History only, 1980–2025, no forecast. Good Earth falls back to the reanalysis when Daymet cannot answer, and names which one it used.",
  },
  {
    name: "Open-Meteo — archived model runs",
    url: "https://open-meteo.com/en/docs/historical-forecast-api",
    role: "The running season, and the feed asked FIRST for it: observed daily max/min, dew point, rain, wind, sunshine and soil temperature up to today, plus the hourly temperature, humidity, dew point and rain the disease models count. The normal band it is measured against comes from Daymet.",
    resolution: "≈ 2 km",
    note: "This page used to name the reanalysis below as the running season. It is the FALLBACK — a coarse reading of the right ground beats no reading — and for wetness the two disagree enough to change a verdict, so every answer names which one spoke.",
  },
  {
    name: "Open-Meteo — historical reanalysis (ERA5)",
    url: "https://open-meteo.com/en/docs/historical-weather-api",
    role: "The fallback for the running season when the archived runs do not answer, and the first choice for a decade of history, where arriving at all matters more than resolution.",
    resolution: "≈ 9 km",
    note: "A model's estimate of past weather, not a station reading — which is why two points on one farm return identical numbers. Measured at Panton over one fortnight it counted 86 hours at or above 90% humidity where the 2 km feed counted 30: a 1.9 °F difference in dew-point depression, across a hard threshold. Wetness is therefore pinned to the finer feed and never spliced between the two.",
  },
  {
    name: "Open-Meteo — forecast",
    url: "https://open-meteo.com/en/docs",
    role: "The 7–16 day outlook: nightly lows, wind, cloud, precipitation chance, hourly soil temperature, sunrise and sunset — and the hourly temperature, humidity, dew point and rain the disease models read ahead. Same model as the archived runs above, so the wetness series does not step at today.",
    resolution: "≈ 2–11 km by model",
    note: "Daily soil aggregates come back empty from this endpoint, so Good Earth asks hourly and averages.",
  },
  {
    name: "Open-Meteo — elevation (SRTM)",
    url: "https://open-meteo.com/en/docs/elevation-api",
    role: "Terrain height at each sample point. A working field sits inside one Daymet pixel, so within a single farm this is still the only feed that resolves anything, and it carries the whole burden of region spread.",
    resolution: "≈ 90 m",
    note: "The only feed that resolves inside a single farm, so it carries the whole burden of region spread.",
  },
  {
    name: "USA National Phenology Network",
    url: "https://www.usanpn.org/data/api",
    role: "Degree-day pest forecasts read at your coordinates; the Spring Index that dates first leaf and first bloom for a block; and the life-cycle phenophases a species is tracked through — nest building, nestlings and fledged young for an animal, breaking leaf buds, open flowers, pollen release and leaf colour for a tree.",
    resolution: "4 km (PRISM) for the forecasts",
    note: "Its rasters carry three different encodings under one namespace; only layers measured to resolve to a date are shown as dates. The Spring Index is computed from cloned lilac and honeysuckle standing in for spring, so it dates one leaf-out for a whole block. Pollen and leaf colour are per-species and come from the phenophase table instead, keyed on the scientific name.",
  },
  {
    name: "NEWA — Network for Environment and Weather Applications (Cornell)",
    url: "https://newa.cornell.edu/",
    role: "The reference implementation of the disease models below. Good Earth reads it for model definitions and to check its own arithmetic; it does not call it and does not depend on it.",
    resolution: "station",
    note: "NEWA runs these models on real station data, including measured leaf wetness. Good Earth estimates wetness from a grid cell. Where the two disagree about your ground, NEWA is nearer the truth — it has a sensor in a field and this does not.",
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
    note: "About 1 km per pixel and roughly two hours of frames — a regional instrument, not a field one.",
  },
  {
    name: "iNaturalist",
    url: "https://api.inaturalist.org/v1/docs/",
    role: "Which species are actually recorded around your ground, ranked by how often each has been seen — the Wildlife and Pests catalogues — plus the photograph shown for each, and importing your own observations into Field Reports. It is also the dictionary that turns a shelf name into a scientific one: every plant in the crop library carries the binomial iNaturalist resolved for it, which is what lets USA-NPN be asked about that plant by name.",
    resolution: "observations, not a grid",
    note: "Read-only. Species photographs are contributors' work under Creative Commons, credited on each image. The names were resolved once and read by a person before they shipped — the search ranks by how often a thing is observed, so a common wildflower sharing a folk name will outrank the crop, and no answer was taken on trust.",
  },
];

const MODELS: { title: string; body: string; assumption: string }[] = [
  {
    title: "Growing degree days",
    body: "Daily mean above a base temperature, by the standard averaging method: both bounds are clamped to the base before averaging, and to an upper threshold when a crop has one.",
    assumption: "A cold night does not un-grow a plant, so the negative half never cancels a warm afternoon. A day missing a bound contributes nothing and the total carries forward flat.",
  },
  {
    title: "Region spread — the lapse rate",
    body: "Temperature falls about 6.5 °C per kilometre of elevation, which is 3.57 °F per thousand feet. Applied to both the daily maximum and minimum at each sample point, relative to the elevation the coarse feed believes its cell sits at.",
    assumption: "The standard environmental lapse rate holds on a mixing day. It is a physical model, not a measurement of your farm.",
  },
  {
    title: "Region spread — cold-air drainage",
    body: "On still, clear nights dense cold air slides downhill and pools in low ground. Applied to the daily MINIMUM only, scaled by how far a point sits below the region's high ground, and capped.",
    assumption: "A calm, clear night inverts the profile — the hollow is colder than the bench. The coefficient is conservative; field reports calibrate it to your ground.",
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
    title: "The normal band",
    body: "The last ten seasons at the region centroid, accumulated the same way and over the same calendar window as the running season, so 'ahead' and 'behind' compare like with like. It is read from Daymet at 1 km.",
    assumption: "Read at 1 km. A decade goes to the reanalysis first — over that span arriving at all beats resolving finely — so the normal band and the running season come from different feeds, and the two disagree: the coarse one runs about 75 GDD low over a season here. 'Ahead of normal' is measured against the finer record.",
  },
  {
    title: "Leaf wetness — estimated, never measured",
    body: "An hour is counted wet when the modelled relative humidity reaches 90%, or when more than 0.2 mm of rain falls into air within 5.4 °F of its dew point. Runs of wet hours, and their mean temperature, are what every disease model below reads.",
    assumption: "A real measurement is a sensor plate in a field, and no feed publishes one for arbitrary ground, so this is the standard substitution and it inherits the grid cell's humidity bias. The threshold is a step laid over a continuous field: a quarter of the hours in a Vermont fortnight sit within five points of it, so a 2 °F bias does not nudge the count — it triples it. That is why the feed is pinned and named.",
  },
  {
    title: "Hutton criteria — late blight",
    body: "Two consecutive days, each with a minimum above 10 °C and at least six hours at 90% humidity. Reported as one period per weather event, not one per overlapping pair of days.",
    assumption: "Counted on relative humidity alone, as published — rain is NOT folded in, or this service's verdict would quietly disagree with every other implementation of the same model. Dancey et al. (2016), successor to the Smith Period.",
  },
  {
    title: "Modified Mills — apple scab",
    body: "Wet hours required at the wet period's mean temperature, from the published table, giving light, moderate or severe infection periods. A short dry break does not reset the count.",
    assumption: "The table is the published one, rounded to whole hours. A wet period whose mean temperature falls outside it is reported as unanswered rather than as no infection. Mills (1944) as revised by Jones.",
  },
  {
    title: "Wallin severity values — early blight",
    body: "A severity value of 0 to 4 per wet period, from its hours and its mean temperature, summed across the season. The literature marks 18 as the point growers begin deciding.",
    assumption: "Cumulative, so the season's total and 'is anything happening this week' are two different facts and are reported separately. What to decide at 18 is not Good Earth's to say. Wallin (1962).",
  },
  {
    title: "Botrytis — grey mould",
    body: "One unbroken stretch of wet hours, long enough for the temperature it happened at: about six hours at 70 °F, eighteen at 45 °F.",
    assumption: "Unbroken, strictly. The same hours split by a dry spell are not the same evidence, and the card says which of the two it found.",
  },
  {
    title: "Powdery mildew — the inverse case",
    body: "Hours of high humidity between 70% and 90% at 68–81 °F, with NO rain in the hour. Six such hours in a row is a conducive spell.",
    assumption: "Free water suppresses this one, so the hours every other model counts are the hours it loses. A wetness counter applied naively reads it exactly backwards, which is why it is stated as its own model rather than folded in with the rest.",
  },
  {
    title: "Projections",
    body: "Past the forecast horizon, accumulation is carried forward at the last fortnight's average rate.",
    assumption: "This is NOT a forecast. It answers 'if the season keeps behaving as it has been', which is the question behind a target date. The further out you read it, the more it is a sketch.",
  },
  {
    title: "Heat budget for suitability",
    body: "Heat accumulated between last spring frost and first fall frost, median across the last eight seasons, at each crop's own base temperature.",
    assumption: "Counted from the last frost, not 1 January, and a crop that finishes on the last warm day of an average year is reported as marginal rather than as a pass.",
  },
  {
    title: "Calibration",
    body: "Your field reports against what the model predicted. Crop stages give a bias in heat; observed frost gives a bias in days. Median, never mean.",
    assumption: "Nothing is applied below three agreeing observations, and implausible values are set aside rather than averaged in.",
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
      <h1 className="figure mb-3.5 text-[22px] font-bold">References</h1>

      <h2 className="figure mb-2.5 text-[18px] font-semibold">🛰️ Sources</h2>
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

      <h2 className="figure mt-8 mb-2.5 text-[18px] font-semibold">📐 Models</h2>
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

      <h2 className="figure mt-8 mb-2.5 text-[18px] font-semibold">🚫 Limits</h2>
      <div className="rounded-md border border-rule border-l-4 border-l-clay bg-panel px-4 py-3.5 text-[13px] leading-relaxed">
        <p><b>No agronomy, entomology or natural history.</b> The catalogues name
          what is modelled or recorded around your ground; the numbers that time
          it stay yours.</p>
        <p className="mt-1.5"><b>No treatment recommendations.</b> A label rate is
          law, and jurisdiction-specific. Event details route you to the extension
          service whose bulletin is authoritative where you farm.</p>
        <p className="mt-1.5"><b>No projection dressed as a date.</b> Anything past
          the forecast horizon is labelled as carried forward at the recent rate,
          everywhere it appears.</p>
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-soft">
        Disagrees with your own record? File a field report.
      </p>
    </>
  );
}
