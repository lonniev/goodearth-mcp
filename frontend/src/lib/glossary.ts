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

import { tr } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/en.ts";

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

const ROWS: Omit<Entry, "term" | "said">[] = [
  // ── Counting heat ──────────────────────────────────────────────────────
  { key: "gdd", group: "heat", aka: ["GDD", "degree day"] },
  { key: "base_temp", group: "heat", aka: ["base", "threshold temperature"] },
  { key: "gdd_target", group: "heat" },
  { key: "biofix", group: "life" },
  { key: "threshold", group: "life" },
  { key: "infection_period", group: "life", aka: ["qualifying period", "wet period"] },
  { key: "severity_value", group: "life", aka: ["SV"] },
  { key: "conducive", group: "life" },
  { key: "leaf_wetness", group: "life", aka: ["wet hours", "estimated", "wetness"] },
  { key: "disease_status", group: "life", aka: ["clear", "all clear", "clear prognosis", "recent", "forecast", "disease status"] },
  { key: "disease_model", group: "life" },
  { key: "late_blight", group: "life", aka: ["Phytophthora infestans", "Hutton criteria", "Smith period"] },
  { key: "early_blight", group: "life", aka: ["Alternaria", "Wallin"] },
  { key: "apple_scab", group: "life", aka: ["Venturia inaequalis", "Mills"] },
  { key: "grey_mould", group: "life", aka: ["botrytis", "gray mold", "Botrytis cinerea"] },
  { key: "powdery_mildew", group: "life", aka: ["mildew"] },
  { key: "spread", group: "ground" },

  // ── Cold, and surviving it ─────────────────────────────────────────────
  { key: "chill_hours", group: "cold" },
  { key: "hardiness", group: "cold", aka: ["hardy to", "cold limit"] },
  { key: "frost_free", group: "cold" },
  { key: "dormancy", group: "cold" },
  { key: "sap_run", group: "cold" },

  // ── The sky ────────────────────────────────────────────────────────────
  { key: "dew_point", group: "sky" },
  { key: "humidity", group: "sky" },
  { key: "pressure", group: "sky", aka: ["barometer", "air pressure", "sea-level pressure", "inHg", "hPa"] },
  { key: "pressure_tendency", group: "sky", aka: ["falling quickly", "storm signal", "storm likely", "unsettled", "bomb"] },
  { key: "dew_point_depression", group: "sky", aka: ["depression"] },
  { key: "water", group: "sky", aka: ["water", "soil moisture", "evapotranspiration", "ET0", "dry soil", "irrigation", "drought"] },
  { key: "drying", group: "sky", aka: ["dew off", "dry day", "drying", "mowing", "harvest", "hay"] },
  { key: "et0", group: "sky", aka: ["ET0", "evaporation", "evaporative demand", "drying power"] },
  { key: "normal", group: "sky", aka: ["normal band", "the grey band"] },
  { key: "daylight", group: "sky", aka: ["photoperiod", "daylight"] },
  { key: "spring_index", group: "sky", aka: ["first leaf", "first bloom"] },

  // ── What lives there ───────────────────────────────────────────────────
  { key: "phenophase", group: "life" },
  { key: "has_a_year", group: "life" },
  { key: "observations", group: "life" },
  { key: "phenology", group: "life" },
  { key: "taxon", group: "life", aka: ["scientific name", "binomial"] },
  { key: "succession", group: "life" },
  { key: "direct_sow", group: "life" },
  { key: "set_out", group: "life", aka: ["planted"] },

  // ── The ground, and the service ────────────────────────────────────────
  { key: "block", group: "ground", aka: ["plot", "ground"] },
  { key: "resolution", group: "service" },
  { key: "provenance", group: "service" },
  { key: "plot_station", group: "service", aka: ["FieldData", "current conditions"] },
  { key: "npub", group: "service", aka: ["Nostr key"] },
  { key: "sats", group: "service", aka: ["satoshi", "Lightning"] },
  { key: "calendar_feed", group: "service" },
];

/// Each entry's term and definition are read from the catalog
/// (`lib.glossary.<key>.term` / `.said`) whenever they are shown, so the page
/// follows a language change.
export const GLOSSARY: Entry[] = ROWS.map((r) => ({
  ...r,
  get term() { return tr(`lib.glossary.${r.key}.term` as MessageKey); },
  get said() { return tr(`lib.glossary.${r.key}.said` as MessageKey); },
}));

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

export const GROUPS: { key: Entry["group"]; label: string }[] = (
  ["heat", "cold", "sky", "life", "ground", "service"] as const
).map((key) => ({ key, get label() { return tr(`lib.glossary.group.${key}` as MessageKey); } }));
