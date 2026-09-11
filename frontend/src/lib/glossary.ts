// The words this site uses, and what they mean.
//
// One source. The definitions used to live as JSX children of each `Term`,
// scattered across the views that happened to need them — so "base
// temperature" was explained on the Crops page and nowhere else, and a grower
// who met the phrase on the Pests page had no way to look it up.
//
// Written for someone who has not farmed by numbers before. Each one says what
// the word means and, where it matters, what Good Earth does NOT claim with it:
// several of these are figures the grower supplies, and a definition that hides
// that would suggest the service knows something it does not.

export interface Entry {
  /// Stable key. Used by `Term of="..."`, so renaming one is a compile error
  /// rather than a definition that silently stops appearing.
  key: string;
  term: string;
  /// One or two sentences. The page renders these as prose, so no markup.
  said: string;
  /// Where a grower meets the word, for the page's own grouping.
  group: "heat" | "cold" | "sky" | "ground" | "life" | "service";
  /// Other names for the same thing, so a search finds it.
  aka?: string[];
}

export const GLOSSARY: Entry[] = [
  // ── Counting heat ──────────────────────────────────────────────────────
  {
    key: "gdd", term: "Growing degree day", group: "heat", aka: ["GDD", "degree day"],
    said: "A day's worth of warmth above the temperature a plant or insect "
      + "starts growing at. A day averaging 60 °F contributes 10 growing degree "
      + "days above a base of 50. They add up through the season, which is why "
      + "a crop is paced by accumulated heat rather than by the calendar: the "
      + "same variety is ready in different weeks in different years.",
  },
  {
    key: "base_temp", term: "Base temperature", group: "heat", aka: ["base", "threshold temperature"],
    said: "The temperature below which a plant or insect does no growing. It "
      + "belongs to the organism and not to the field — winter wheat counts "
      + "from 32 °F and field corn from 50 °F on the same acre — which is why "
      + "it sits on the planting rather than on the block.",
  },
  {
    key: "gdd_target", term: "Degree-day target", group: "heat",
    said: "The heat one planting needs from set-out to the stage you care "
      + "about. Nobody publishes it for a cultivar, so it comes off your seed "
      + "packet or your extension bulletin. Good Earth counts what your ground "
      + "delivered against the figure you gave it.",
  },
  {
    key: "biofix", term: "Biofix", group: "life",
    said: "The day a degree-day count starts for a pest. For most published "
      + "models it is the first sustained catch in a trap, not a date on the "
      + "calendar — which is why two farms in one county can be a week apart.",
  },
  {
    key: "threshold", term: "Threshold", group: "life",
    said: "The accumulated heat at which a stage is expected to arrive. Yours "
      + "to set: the published figures vary by region and by the model you "
      + "trust, and this service records the one you chose rather than "
      + "asserting one of its own.",
  },
  {
    key: "infection_period", term: "Infection period", group: "life",
    aka: ["qualifying period", "wet period"],
    said: "A stretch of weather that met a disease model's criteria — long "
      + "enough wet, at the right temperature, for an infection to have been "
      + "possible. It says the conditions occurred, not that the crop caught "
      + "anything: whether spores were present, and what to do about it, is "
      + "between you and your extension service.",
  },
  {
    key: "severity_value", term: "Severity value", group: "life",
    aka: ["SV"],
    said: "A score from 0 to 4 that one wet period contributes, from how many "
      + "hours it ran and how warm it was. They add up across the season the "
      + "way degree days do, which is why an early-blight answer carries a "
      + "running total as well as a date.",
  },
  {
    key: "conducive", term: "Conducive", group: "life",
    said: "Weather that favours a disease without being an infection period — "
      + "used here for powdery mildew, which wants humid air and is set back "
      + "by rain. It is the one model where a wet hour counts against rather "
      + "than for, so it is reported in its own words.",
  },
  {
    key: "leaf_wetness", term: "Leaf wetness", group: "life",
    aka: ["wet hours", "estimated", "wetness"],
    said: "How long a leaf stays wet, which is what decides a fungal infection "
      + "the way accumulated heat decides an insect. Good Earth ESTIMATES it: a "
      + "real measurement is a sensor plate in a field, and no weather service "
      + "publishes one for arbitrary ground, so an hour is counted wet when the "
      + "modelled humidity reaches 90% or rain falls into air already close to "
      + "its dew point. That is the standard substitution and it inherits the "
      + "weather grid's own bias — near a lake, two feeds a couple of degrees "
      + "apart on dew point can differ threefold on the hours they count.",
  },
  {
    key: "spread", term: "Spread", group: "ground",
    said: "The difference an answer shows across your block. A bench and a "
      + "hollow on the same acreage do not share a frost date, so every answer "
      + "carries the range over the ground it was measured on rather than a "
      + "single number for a pin.",
  },

  // ── Cold, and surviving it ─────────────────────────────────────────────
  {
    key: "chill_hours", term: "Chill hours", group: "cold",
    said: "Hours a plant spent at or below about 45 °F over the winter. Fruit "
      + "trees need a quantity of it before they will bloom evenly, and a warm "
      + "winter can leave a tree that is perfectly hardy blooming raggedly or "
      + "not at all.",
  },
  {
    key: "hardiness", term: "Hardiness", group: "cold", aka: ["hardy to", "cold limit"],
    said: "The lowest temperature a plant survives. Good Earth compares it "
      + "against the coldest night in your block's own record for each winter, "
      + "and answers with how often that ground went below it — which is a "
      + "different question from the zone on the label.",
  },
  {
    key: "frost_free", term: "Frost-free days", group: "cold",
    said: "The length of the growing season on your ground: the run of days "
      + "between the last spring frost and the first in autumn, taken as a "
      + "median over the seasons on record rather than from one year.",
  },
  {
    key: "dormancy", term: "Dormancy", group: "cold",
    said: "The part of the year a perennial spends not growing. Chill is "
      + "banked during it, which is why winter is part of a tree's cycle and "
      + "not a gap between growing seasons.",
  },
  {
    key: "sap_run", term: "Sap run", group: "cold",
    said: "The days sap moves in a tapped tree: a night below freezing "
      + "followed by a day above it. It answers to freeze and thaw rather "
      + "than to warmth, and it ends when the nights stop freezing.",
  },

  // ── The sky ────────────────────────────────────────────────────────────
  {
    key: "dew_point", term: "Dew point", group: "sky",
    said: "The temperature air must cool to before its water condenses. It is "
      + "the absolute measure of how much water the air holds, and a run of "
      + "high dew points is disease weather whatever the heat total says.",
  },
  {
    key: "humidity", term: "Relative humidity", group: "sky",
    said: "How close the air is to holding all the water it can, as a "
      + "percentage. It moves with temperature: the same water reads 90 % at "
      + "dawn and 50 % by noon because the air warmed, not because anything "
      + "dried. The dew point is the steadier figure; this is what a leaf feels.",
  },
  {
    key: "normal", term: "Normal", group: "sky", aka: ["normal band", "the grey band"],
    said: "What this ground usually does on this date, taken from its own "
      + "record over the last ten seasons. It is the band a chart draws behind "
      + "the current year — not a target, and not a forecast.",
  },
  {
    key: "daylight", term: "Day length", group: "sky", aka: ["photoperiod", "daylight"],
    said: "Hours between sunrise and sunset. It is astronomy, so it is the one "
      + "reading here that is computed exactly rather than forecast, and it "
      + "falls on the same date every year whatever the weather does.",
  },
  {
    key: "spring_index", term: "Spring Index", group: "sky", aka: ["first leaf", "first bloom"],
    said: "USA-NPN's dating of when spring arrived at a point, as first leaf "
      + "and first bloom. It is computed from cloned indicator plants, so it "
      + "gives one date for a whole block rather than a date for each of your "
      + "trees.",
  },

  // ── What lives there ───────────────────────────────────────────────────
  {
    key: "phenophase", term: "Phenophase", group: "life",
    said: "A stage of a plant or animal's year that somebody can see and "
      + "record: breaking leaf buds, open flowers, pollen release, coloured "
      + "leaves. USA-NPN publishes which ones it tracks for a species; when "
      + "each arrives on your ground is yours to record.",
  },
  {
    key: "has_a_year", term: "Has a year", group: "life",
    said: "USA-NPN publishes a life cycle for this species — the stages it is "
      + "tracked through, such as breaking leaf buds, open flowers, pollen "
      + "release or coloured leaves. It means there is a year to look at, not "
      + "that Good Earth knows when any of it happens on your ground. When "
      + "each stage arrives here is yours to record.",
  },
  {
    key: "observations", term: "Observations", group: "life",
    said: "How many times somebody recorded this species near your ground, in "
      + "iNaturalist. It measures observers as much as organisms: a roadside "
      + "is better recorded than a back hayfield, so a high count is evidence "
      + "that people were standing there — not that a thing is common on your "
      + "land.",
  },
  {
    key: "phenology", term: "Phenology", group: "life",
    said: "The timing of natural events through the year, and the study of "
      + "what moves them. Everything on this site is phenology: not what the "
      + "weather is, but what the weather means for when things happen.",
  },
  {
    key: "taxon", term: "Taxon", group: "life", aka: ["scientific name", "binomial"],
    said: "A named group in the tree of life, and the scientific name that "
      + "identifies it — Acer saccharum for sugar maple. Good Earth stores the "
      + "one you pick because the scientific databases it asks are keyed on "
      + "it; no catalogue anywhere has a row for “Maple · sugar”.",
  },
  {
    key: "succession", term: "Succession", group: "life",
    said: "One of several plantings of the same crop, put in weeks apart so "
      + "the harvest is continuous. Each is its own row here, because each has "
      + "its own set-out date and so its own heat to count.",
  },
  {
    key: "direct_sow", term: "Direct sow", group: "life",
    said: "Sown where it will grow rather than started under lights and moved. "
      + "It waits on soil temperature rather than on air, and soil lags air by "
      + "weeks in spring.",
  },
  {
    key: "set_out", term: "Set-out", group: "life", aka: ["planted"],
    said: "The day a planting went into the ground. Heat is counted from it, "
      + "so a wrong set-out moves every date that follows.",
  },

  // ── The ground, and the service ────────────────────────────────────────
  {
    key: "block", term: "Block", group: "ground", aka: ["plot", "ground"],
    said: "A piece of your ground, saved once as a shape with a name. Every "
      + "tool takes a block and samples across it, so the geometry travels "
      + "once instead of on every question.",
  },
  {
    key: "resolution", term: "Resolution", group: "service",
    said: "How fine the feed behind an answer actually is. A 9 km reanalysis "
      + "cell covers a whole town, so two points on one farm return the same "
      + "number from it. Every answer names the feed it came from and how "
      + "coarse that feed is.",
  },
  {
    key: "provenance", term: "Provenance", group: "service",
    said: "Which service answered, when, and what it cost. It appears beside "
      + "every computed answer, because a figure you cannot trace is one you "
      + "have to take on trust.",
  },
  {
    key: "npub", term: "npub", group: "service", aka: ["Nostr key"],
    said: "Your public Nostr key, which is how this service knows you. There "
      + "is no email, no password and no account to recover — the key is the "
      + "identity, and your ground is stored against it.",
  },
  {
    key: "sats", term: "Sats", group: "service", aka: ["satoshi", "Lightning"],
    said: "Satoshis, the smallest unit of Bitcoin, paid over the Lightning "
      + "network. Answers are priced per call against a balance you top up in "
      + "advance, so nothing interrupts you to ask for payment.",
  },
  {
    key: "calendar_feed", term: "Calendar feed", group: "service",
    said: "A subscribable link that puts this block's dated events into "
      + "whatever calendar you already use. It updates as the season moves.",
  },
];

const BY_KEY = new Map(GLOSSARY.map((e) => [e.key, e]));

/// One entry, or undefined. Undefined rather than a thrown error, because a
/// missing definition should cost a reader a tooltip and never a page.
export function define(key: string): Entry | undefined {
  return BY_KEY.get(key);
}

/// Entries matching what has been typed, over term, aka and the definition.
///
/// The definition text is searched too: a grower who half-remembers "the grey
/// band on the chart" does not know it is filed under Normal.
export function searchGlossary(q: string): Entry[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return GLOSSARY;
  return GLOSSARY.filter((e) =>
    e.term.toLowerCase().includes(needle)
    || e.said.toLowerCase().includes(needle)
    || (e.aka ?? []).some((a) => a.toLowerCase().includes(needle)));
}

export const GROUPS: { key: Entry["group"]; label: string }[] = [
  { key: "heat", label: "Counting heat" },
  { key: "cold", label: "Cold, and surviving it" },
  { key: "sky", label: "The sky" },
  { key: "life", label: "What lives there" },
  { key: "ground", label: "Your ground" },
  { key: "service", label: "The service" },
];
