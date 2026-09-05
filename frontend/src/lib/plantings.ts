// The block's plantings.
//
// A planting is a crop, a target, and the day it went out. Like regions, these
// belong on Nostr as NIP-78 `goodearth/crops` events; localStorage is the
// offline cache in that design and is what ships first. Keeping the store
// behind this module means the write-through is one file later, not a sweep.

export interface Planting {
  id: string;
  crop: string;
  /// Growing degree days from set-out to the stage the grower cares about.
  gddTarget?: number;
  setOut: string; // YYYY-MM-DD
  /// Per-crop override; blank means the block's default.
  baseTempF?: number;
  /// A perennial: also judged on whether it survives the winter here and gets
  /// its chill. Not instead — a perennial may carry a heat target too, when
  /// the target is a within-season event like a cutting.
  perennial?: boolean;
  /// Chill hours the cultivar needs, and the temperature it is lost at. Both
  /// are the grower's own figures from the nursery tag — Good Earth computes
  /// what this ground delivered against them.
  chillHours?: number;
  hardyToF?: number;
  /// Which saved region this planting is on.
  regionId: string;
  /// Carried from the preset so the server can ask USA-NPN about this plant
  /// by name. Absent on anything the grower typed themselves, which is why
  /// every reader treats it as optional.
  scientificName?: string;
}

/// Starting points from extension data, so a grower is not staring at an empty
/// table. These are typical targets, not promises — the whole point of the
/// calibration loop is that a farm learns its own.
export interface CropPreset {
  crop: string;
  /// Heat from set-out to the stage that matters. **Absent for a perennial**,
  /// which does not answer to one: a tree is not asked "does it finish before
  /// frost", and giving it a target would invent a number the plant does not
  /// answer to.
  gddTarget?: number;
  /// Absent for a perennial, which accumulates no heat toward anything this
  /// page counts — printing "base 50 °F" under an apple tree would state a
  /// fact that isn't.
  baseTempF?: number;
  note: string;
  emoji: string;
  category:
    | "field" | "flower" | "vegetable" | "cover"
    | "orchard" | "herb" | "forest";
  /// Lives across seasons, so it is ALSO asked whether it survives the winter
  /// here and whether it gets its chill. Not instead: alfalfa is a perennial
  /// that answers a heat target per cutting, and both ratings are true of it.
  perennial?: boolean;
  /// Chill hours at or below 45 °F needed to break dormancy or set bloom.
  /// Present only where chill is genuinely the mechanism and a grower can find
  /// a published figure — fruit, and the bulbs that are set by last winter.
  /// Absent on a plant whose limit is simply cold, because a number invented
  /// to fill the column would be worse than the blank.
  chillHours?: number;
  /// The temperature it is lost at, °F. On every perennial, because this is
  /// the question every one of them is asked. A starting figure: siting,
  /// snow cover, rootstock and age all move it.
  hardyToF?: number;
  /// Survives a light frost, so it can use the shoulders of the season.
  frostHardy?: boolean;
  /// Sown where it grows rather than transplanted — so it waits on the soil.
  directSow?: boolean;
  /// Soil temperature it will germinate at, °F. Soil lags air by weeks, so
  /// for a direct sowing this is usually the binding constraint, not frost.
  minSoilF?: number;
  /// Weeks under lights before it goes out. This is the seed-packet date.
  startIndoorsWeeks?: number;
  /// The accepted scientific name, resolved from the shelf name by
  /// `scripts/resolve_species.py` against iNaturalist and reviewed by hand —
  /// not typed from memory, and not looked up while a grower waits. It is what
  /// lets Good Earth ask USA-NPN which life-cycle stages this plant is
  /// tracked through, since NPN is keyed on the binomial and not on "Sugar
  /// maple". A genus is a real answer where the grower plants a cultivar with
  /// no single species: an Asiatic lily is a Lilium and nothing narrower.
  scientificName?: string;
}

/// Starting points, not published agronomy.
///
/// Degree-day requirements vary by cultivar and maturity group — a corn hybrid
/// is SOLD by its relative maturity precisely because "corn" has no single
/// number. These are mid-range figures to edit against your own seed packet and
/// your own extension bulletin, and the UI says so wherever they appear.
export const CROP_PRESETS: CropPreset[] = [
  // ── Field and commodity ────────────────────────────────────────────────
  { crop: "Field corn · short season", gddTarget: 2200, baseTempF: 50, emoji: "🌽",
    category: "field", note: "grain, ~85-day hybrid",
    directSow: true, minSoilF: 55,
    scientificName: "Zea mays" },
  { crop: "Field corn · long season", gddTarget: 2800, baseTempF: 50, emoji: "🌽",
    category: "field", note: "grain, ~110-day hybrid",
    directSow: true, minSoilF: 55,
    scientificName: "Zea mays" },
  { crop: "Silage corn", gddTarget: 2400, baseTempF: 50, emoji: "🌽",
    category: "field", note: "to dent stage",
    directSow: true, minSoilF: 55,
    scientificName: "Zea mays" },
  { crop: "Soybean", gddTarget: 2500, baseTempF: 50, emoji: "🫘",
    category: "field", note: "to maturity, mid group",
    directSow: true, minSoilF: 55,
    scientificName: "Glycine max" },
  { crop: "Sunflower", gddTarget: 2200, baseTempF: 44, emoji: "🌻",
    category: "field", note: "oilseed, to physiological maturity",
    directSow: true, minSoilF: 50,
    scientificName: "Helianthus annuus" },
  { crop: "Hemp · grain", gddTarget: 2000, baseTempF: 50, emoji: "🌿",
    category: "field", note: "to seed maturity",
    directSow: true, minSoilF: 50,
    scientificName: "Cannabis sativa" },
  { crop: "Hemp · fibre", gddTarget: 1700, baseTempF: 50, emoji: "🌿",
    category: "field", note: "to technical maturity",
    directSow: true, minSoilF: 50,
    scientificName: "Cannabis sativa" },
  // A perennial that ALSO answers a heat target: 750 GDD is one cutting's
  // regrowth, and the stand itself is asked whether it survives the winter.
  // Both ratings are true of it, which is why the library's two lists overlap
  // rather than partition it.
  { crop: "Alfalfa", gddTarget: 750, baseTempF: 41, emoji: "🍀",
    category: "field", note: "per cutting, frost hardy", frostHardy: true,
    perennial: true, hardyToF: -25,
    directSow: true, minSoilF: 42,
    scientificName: "Medicago sativa" },
  { crop: "Winter wheat", gddTarget: 2100, baseTempF: 32, emoji: "🌾",
    category: "field", note: "after vernalisation", frostHardy: true,
    directSow: true, minSoilF: 40,
    scientificName: "Triticum aestivum" },
  { crop: "Oats", gddTarget: 1700, baseTempF: 40, emoji: "🌾",
    category: "field", note: "to grain", frostHardy: true,
    directSow: true, minSoilF: 40,
    scientificName: "Avena" },
  { crop: "Barley", gddTarget: 1600, baseTempF: 40, emoji: "🌾",
    category: "field", note: "to grain", frostHardy: true,
    directSow: true, minSoilF: 40,
    scientificName: "Hordeum vulgare" },
  { crop: "Canola", gddTarget: 1900, baseTempF: 41, emoji: "🌼",
    category: "field", note: "spring type", frostHardy: true,
    directSow: true, minSoilF: 41,
    scientificName: "Brassica napus" },
  { crop: "Sorghum", gddTarget: 2400, baseTempF: 50, emoji: "🌾",
    category: "field", note: "to grain",
    directSow: true, minSoilF: 60,
    scientificName: "Sorghum" },
  { crop: "Buckwheat", gddTarget: 1000, baseTempF: 50, emoji: "🥞",
    category: "cover", note: "to seed, fast smother crop",
    directSow: true, minSoilF: 50,
    scientificName: "Fagopyrum esculentum" },
  { crop: "Field peas", gddTarget: 1400, baseTempF: 40, emoji: "🫛",
    category: "field", note: "to dry seed", frostHardy: true,
    directSow: true, minSoilF: 45,
    scientificName: "Pisum sativum" },
  { crop: "Dry bean", gddTarget: 1700, baseTempF: 50, emoji: "🫘",
    category: "field", note: "to dry seed",
    directSow: true, minSoilF: 55,
    scientificName: "Phaseolus vulgaris" },

  // ── Vegetable ──────────────────────────────────────────────────────────
  { crop: "Pumpkin", gddTarget: 1800, baseTempF: 50, emoji: "🎃",
    category: "vegetable", note: "to orange fruit",
    directSow: true, minSoilF: 60, startIndoorsWeeks: 3,
    scientificName: "Cucurbita pepo" },
  { crop: "Winter squash", gddTarget: 1600, baseTempF: 50, emoji: "🎃",
    category: "vegetable", note: "to maturity",
    directSow: true, minSoilF: 60, startIndoorsWeeks: 3,
    scientificName: "Cucurbita maxima" },
  { crop: "Sweet corn", gddTarget: 1500, baseTempF: 50, emoji: "🌽",
    category: "vegetable", note: "to first pick",
    directSow: true, minSoilF: 55,
    scientificName: "Zea mays" },
  { crop: "Tomato", gddTarget: 1300, baseTempF: 50, emoji: "🍅",
    category: "vegetable", note: "to first ripe fruit",
    startIndoorsWeeks: 6, minSoilF: 60,
    scientificName: "Solanum lycopersicum" },
  { crop: "Hot pepper", gddTarget: 1650, baseTempF: 50, emoji: "🌶️",
    category: "vegetable", note: "to ripe fruit",
    startIndoorsWeeks: 8, minSoilF: 65,
    scientificName: "Capsicum" },
  { crop: "Potato", gddTarget: 1800, baseTempF: 45, emoji: "🥔",
    category: "vegetable", note: "to bulking",
    directSow: true, minSoilF: 45,
    scientificName: "Solanum tuberosum" },
  { crop: "Garlic", gddTarget: 1900, baseTempF: 40, emoji: "🧄",
    category: "vegetable", note: "autumn planted, to scape", frostHardy: true,
    directSow: true,
    scientificName: "Allium sativum" },
  { crop: "Onion", gddTarget: 1900, baseTempF: 45, emoji: "🧅",
    category: "vegetable", note: "to bulbing", frostHardy: true,
    startIndoorsWeeks: 10, minSoilF: 45,
    scientificName: "Allium cepa" },
  { crop: "Carrot", gddTarget: 1300, baseTempF: 40, emoji: "🥕",
    category: "vegetable", note: "to size", frostHardy: true,
    directSow: true, minSoilF: 45,
    scientificName: "Daucus carota" },
  { crop: "Brassicas", gddTarget: 1200, baseTempF: 40, emoji: "🥬",
    category: "vegetable", note: "cabbage, broccoli, to head", frostHardy: true,
    startIndoorsWeeks: 5, minSoilF: 45,
    scientificName: "Brassica" },
  { crop: "Watermelon", gddTarget: 3200, baseTempF: 55, emoji: "🍉",
    category: "vegetable", note: "to ripe fruit",
    startIndoorsWeeks: 4, minSoilF: 65,
    scientificName: "Citrullus lanatus" },
  { crop: "Basil", gddTarget: 600, baseTempF: 50, emoji: "🌿",
    category: "herb", note: "to first cut",
    startIndoorsWeeks: 6, minSoilF: 60,
    scientificName: "Ocimum basilicum" },

  // ── Cut flower ─────────────────────────────────────────────────────────
  { crop: "Dahlia", gddTarget: 1200, baseTempF: 50, emoji: "🌸",
    category: "flower", note: "to first bloom",
    startIndoorsWeeks: 4, minSoilF: 60,
    scientificName: "Dahlia" },
  { crop: "Lisianthus", gddTarget: 1050, baseTempF: 50, emoji: "💐",
    category: "flower", note: "to cut stage from pinch",
    startIndoorsWeeks: 10, minSoilF: 55,
    scientificName: "Eustoma" },
  { crop: "Celosia", gddTarget: 900, baseTempF: 50, emoji: "🌺",
    category: "flower", note: "to cut stage",
    startIndoorsWeeks: 5, minSoilF: 60,
    scientificName: "Celosia" },
  { crop: "Zinnia", gddTarget: 780, baseTempF: 50, emoji: "🌼",
    category: "flower", note: "to cut stage from sow",
    startIndoorsWeeks: 4, minSoilF: 60,
    scientificName: "Zinnia" },
  { crop: "Ranunculus", gddTarget: 900, baseTempF: 40, emoji: "🌷",
    category: "flower", note: "cool season, to cut", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 45,
    scientificName: "Ranunculus" },
  { crop: "Snapdragon", gddTarget: 850, baseTempF: 40, emoji: "🌷",
    category: "flower", note: "to cut stage", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 45,
    scientificName: "Antirrhinum majus" },

  // The bench above was six deep because the field list got the attention, not
  // because six flowers grow here.
  //
  // This once said "ANNUALS ONLY, deliberately", and that was a working
  // decision of one afternoon written down as though it were a rule. It was
  // half right and wholly the wrong conclusion. Half right: a peony does not
  // answer to a heat target, so "does it finish before frost" cannot be asked
  // of it. Wrong conclusion: what followed from that is that a perennial needs
  // a DIFFERENT rating, not that it should be left out of the catalogue. It
  // now has one — whether it survives the winter here and whether it gets its
  // chill — so nothing is excluded for want of a model any more.

  // ── Hardy annuals — go out around the last frost, base 40 ──────────────
  { crop: "Bachelor's button", gddTarget: 700, baseTempF: 40, emoji: "🪻",
    category: "flower", note: "to cut stage from sow", frostHardy: true,
    directSow: true, minSoilF: 45,
    scientificName: "Centaurea cyanus" },
  { crop: "Larkspur", gddTarget: 900, baseTempF: 40, emoji: "🪻",
    category: "flower", note: "wants a cold start, to cut", frostHardy: true,
    directSow: true, minSoilF: 40,
    scientificName: "Delphinium" },
  { crop: "Nigella", gddTarget: 700, baseTempF: 40, emoji: "🌼",
    category: "flower", note: "to cut stage from sow", frostHardy: true,
    directSow: true, minSoilF: 45,
    scientificName: "Nigella" },
  { crop: "Sweet pea", gddTarget: 800, baseTempF: 40, emoji: "🌸",
    category: "flower", note: "to first cut", frostHardy: true,
    directSow: true, minSoilF: 45,
    scientificName: "Lathyrus odoratus" },
  { crop: "Bells of Ireland", gddTarget: 950, baseTempF: 40, emoji: "🍃",
    category: "flower", note: "slow to germinate, to cut", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 45,
    scientificName: "Moluccella laevis" },
  { crop: "Stock", gddTarget: 900, baseTempF: 40, emoji: "💐",
    category: "flower", note: "cool season, to cut", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 45,
    scientificName: "Matthiola" },
  { crop: "Scabiosa", gddTarget: 850, baseTempF: 40, emoji: "🌸",
    category: "flower", note: "to cut stage", frostHardy: true,
    startIndoorsWeeks: 6, minSoilF: 50,
    scientificName: "Scabiosa" },
  { crop: "Ammi", gddTarget: 1000, baseTempF: 40, emoji: "🌼",
    category: "flower", note: "false Queen Anne's lace, to cut", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 45,
    scientificName: "Ammi" },
  { crop: "Rudbeckia", gddTarget: 1000, baseTempF: 40, emoji: "🌻",
    category: "flower", note: "to cut stage", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 50,
    scientificName: "Rudbeckia" },
  { crop: "Sweet William", gddTarget: 950, baseTempF: 40, emoji: "🌺",
    category: "flower", note: "annual types, to cut", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 50,
    scientificName: "Dianthus barbatus" },
  { crop: "Feverfew", gddTarget: 1050, baseTempF: 40, emoji: "🌼",
    category: "flower", note: "to cut stage", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 50,
    scientificName: "Tanacetum parthenium" },

  // ── Tender annuals — wait on frost and on soil, base 50 ────────────────
  { crop: "Cosmos", gddTarget: 850, baseTempF: 50, emoji: "🌸",
    category: "flower", note: "to cut stage from sow",
    directSow: true, minSoilF: 60,
    scientificName: "Cosmos" },
  { crop: "Sunflower · cut", gddTarget: 700, baseTempF: 50, emoji: "🌻",
    category: "flower", note: "single-stem, to cut",
    directSow: true, minSoilF: 55,
    scientificName: "Helianthus annuus" },
  { crop: "Amaranth", gddTarget: 1000, baseTempF: 50, emoji: "🌾",
    category: "flower", note: "to cut stage",
    startIndoorsWeeks: 4, minSoilF: 65,
    scientificName: "Amaranthus" },
  { crop: "Gomphrena", gddTarget: 950, baseTempF: 50, emoji: "🌺",
    category: "flower", note: "to cut stage",
    startIndoorsWeeks: 6, minSoilF: 65,
    scientificName: "Gomphrena" },
  { crop: "Strawflower", gddTarget: 850, baseTempF: 50, emoji: "🌼",
    category: "flower", note: "to cut stage",
    startIndoorsWeeks: 5, minSoilF: 60,
    scientificName: "Xerochrysum bracteatum" },
  { crop: "Marigold", gddTarget: 800, baseTempF: 50, emoji: "🌼",
    category: "flower", note: "African types, to cut",
    startIndoorsWeeks: 5, minSoilF: 60,
    scientificName: "Tagetes" },
  { crop: "Ageratum", gddTarget: 900, baseTempF: 50, emoji: "🪻",
    category: "flower", note: "tall types, to cut",
    startIndoorsWeeks: 6, minSoilF: 60,
    scientificName: "Ageratum" },
  { crop: "Statice", gddTarget: 1000, baseTempF: 50, emoji: "🪻",
    category: "flower", note: "to cut stage",
    startIndoorsWeeks: 8, minSoilF: 55,
    scientificName: "Limonium" },

  // ── Cover ──────────────────────────────────────────────────────────────
  { crop: "Winter rye", gddTarget: 900, baseTempF: 38, emoji: "🌾",
    category: "cover", note: "autumn sown, to overwinter", frostHardy: true,
    directSow: true, minSoilF: 38,
    scientificName: "Secale cereale" },
  { crop: "Clover · red", hardyToF: -30, emoji: "🍀",
    category: "cover", perennial: true, note: "a stand, not a one-season cover",
    scientificName: "Trifolium pratense" },
  { crop: "Timothy", hardyToF: -35, emoji: "🌾",
    category: "cover", perennial: true, note: "hay stand",
    scientificName: "Phleum pratense" },
  { crop: "Hops", gddTarget: 2000, baseTempF: 50, emoji: "🌿",
    category: "field", perennial: true, hardyToF: -30,
    note: "per season to cone; the crown lives on",
    scientificName: "Humulus" },
  { crop: "Crimson clover", gddTarget: 1100, baseTempF: 41, emoji: "🍀",
    category: "cover", note: "to bloom", frostHardy: true,
    directSow: true, minSoilF: 42,
    scientificName: "Trifolium incarnatum" },
  { crop: "Daikon radish", gddTarget: 900, baseTempF: 45, emoji: "🌱",
    category: "cover", note: "tillage radish, to size", frostHardy: true,
    directSow: true, minSoilF: 45,
    scientificName: "Raphanus" },

  // ── Perennial cut flowers and bulbs ───────────────────────────────────
  //
  // These were the plants the "annuals only" note actually excluded, and they
  // are the backbone of a cut-flower year rather than a curiosity at its
  // edges. A bulb carries a chill figure because chill IS its mechanism — a
  // tulip is set by the cold it had, not by the heat it will get. A herbaceous
  // perennial mostly carries only hardiness, because that is the only number
  // anyone publishes for it and inventing a chill requirement to fill the
  // column would be worse than the blank.
  { crop: "Peony", chillHours: 900, hardyToF: -40, emoji: "\u{1F338}",
    category: "flower", perennial: true, note: "third year to a cutting stem",
    scientificName: "Paeonia" },
  { crop: "Tulip", chillHours: 700, hardyToF: -35, emoji: "\u{1F337}",
    category: "flower", perennial: true, note: "set by last winter, not this summer",
    scientificName: "Tulipa gesneriana" },
  { crop: "Daffodil", chillHours: 600, hardyToF: -35, emoji: "\u{1F33C}",
    category: "flower", perennial: true, note: "deer leave it alone",
    scientificName: "Narcissus" },
  { crop: "Allium", chillHours: 600, hardyToF: -35, emoji: "\u{1FAB7}",
    category: "flower", perennial: true, note: "",
    scientificName: "Allium" },
  { crop: "Lily · Asiatic", chillHours: 500, hardyToF: -30, emoji: "\u{1F33A}",
    category: "flower", perennial: true, note: "",
    scientificName: "Lilium" },
  { crop: "Iris · bearded", hardyToF: -35, emoji: "\u{1FAB7}",
    category: "flower", perennial: true, note: "wants the rhizome shallow",
    scientificName: "Iris" },
  { crop: "Delphinium", hardyToF: -40, emoji: "\u{1FAB7}",
    category: "flower", perennial: true, note: "short-lived; treat as three years",
    scientificName: "Delphinium" },
  { crop: "Echinacea", hardyToF: -35, emoji: "\u{1F33C}",
    category: "flower", perennial: true, note: "",
    scientificName: "Echinacea" },
  { crop: "Phlox · garden", hardyToF: -35, emoji: "\u{1F338}",
    category: "flower", perennial: true, note: "",
    scientificName: "Phlox paniculata" },
  { crop: "Yarrow", hardyToF: -40, emoji: "\u{1F33C}",
    category: "flower", perennial: true, note: "",
    scientificName: "Achillea millefolium" },
  { crop: "Astilbe", hardyToF: -35, emoji: "\u{1FAB7}",
    category: "flower", perennial: true, note: "the shade end of the field",
    scientificName: "Astilbe" },
  { crop: "Baptisia", hardyToF: -35, emoji: "\u{1FAB7}",
    category: "flower", perennial: true, note: "slow to settle, then decades",
    scientificName: "Baptisia" },
  { crop: "Monarda", hardyToF: -40, emoji: "\u{1F33A}",
    category: "flower", perennial: true, note: "the pollinators find it first",
    scientificName: "Monarda" },
  { crop: "Aster · New England", hardyToF: -40, emoji: "\u{1F33C}",
    category: "flower", perennial: true, note: "the last flow before frost",
    scientificName: "Symphyotrichum novae-angliae" },
  { crop: "Chrysanthemum · hardy", hardyToF: -30, emoji: "\u{1F33C}",
    category: "flower", perennial: true, note: "",
    scientificName: "Chrysanthemum" },
  { crop: "Hellebore", hardyToF: -25, emoji: "\u{1F338}",
    category: "flower", perennial: true, note: "blooms through snow",
    scientificName: "Helleborus" },
  { crop: "Lily of the valley", hardyToF: -40, emoji: "\u{1F33F}",
    category: "flower", perennial: true, note: "spreads; give it an edge to stop at",
    scientificName: "Convallaria majalis" },
  { crop: "Sedum", hardyToF: -40, emoji: "\u{1F33F}",
    category: "flower", perennial: true, note: "",
    scientificName: "Sedum" },
  { crop: "Lilac", chillHours: 800, hardyToF: -40, emoji: "\u{1FAB7}",
    category: "flower", perennial: true, note: "USA-NPN dates its leaf and bloom",
    scientificName: "Syringa vulgaris" },
  { crop: "Hydrangea", hardyToF: -25, emoji: "\u{1F338}",
    category: "flower", perennial: true, note: "old wood: a hard winter costs the bloom",
    scientificName: "Hydrangea" },
  { crop: "Viburnum", hardyToF: -35, emoji: "\u{1FAB7}",
    category: "flower", perennial: true, note: "",
    scientificName: "Viburnum" },

  // ── Bush, cane and vine fruit ─────────────────────────────────────────
  //
  // Fruit, not orchard: a grower thinking "fruit" wants the raspberries and
  // the apples in one place, so they share a category and the pill says Fruit.
  { crop: "Strawberry · June", chillHours: 300, hardyToF: -25, emoji: "\u{1F353}",
    category: "orchard", perennial: true, note: "one flush; renovate after",
    scientificName: "Fragaria" },
  { crop: "Strawberry · everbearing", chillHours: 200, hardyToF: -20, emoji: "\u{1F353}",
    category: "orchard", perennial: true, note: "picks through the season",
    scientificName: "Fragaria" },
  { crop: "Raspberry · summer", chillHours: 800, hardyToF: -30, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "floricane: last year's wood",
    scientificName: "Rubus idaeus" },
  { crop: "Raspberry · fall", chillHours: 700, hardyToF: -25, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "primocane: mow it to the ground",
    scientificName: "Rubus idaeus" },
  { crop: "Blackberry", chillHours: 500, hardyToF: -15, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "canes kill back in a hard winter",
    scientificName: "Rubus fruticosus" },
  { crop: "Currant · black", chillHours: 800, hardyToF: -35, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "check your state's white-pine rules",
    scientificName: "Ribes nigrum" },
  { crop: "Gooseberry", chillHours: 800, hardyToF: -30, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "",
    scientificName: "Ribes uva-crispa" },
  { crop: "Grape · cold-hardy", chillHours: 1000, hardyToF: -30, emoji: "\u{1F347}",
    category: "orchard", perennial: true, note: "Marquette, Frontenac and kin",
    scientificName: "Vitis vinifera" },
  { crop: "Kiwi · hardy", chillHours: 600, hardyToF: -25, emoji: "\u{1F95D}",
    category: "orchard", perennial: true, note: "needs a male vine nearby",
    scientificName: "Actinidia arguta" },
  { crop: "Aronia", chillHours: 800, hardyToF: -35, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "",
    scientificName: "Aronia melanocarpa" },
  { crop: "Honeyberry", chillHours: 500, hardyToF: -40, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "haskap; the earliest fruit of the year",
    scientificName: "Lonicera caerulea" },
  { crop: "Cranberry", chillHours: 800, hardyToF: -30, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "wants acid and wet",
    scientificName: "Vaccinium macrocarpon" },

  // ── Perennial vegetables ──────────────────────────────────────────────
  { crop: "Asparagus", hardyToF: -35, emoji: "\u{1F33F}",
    category: "vegetable", perennial: true, note: "third spring to a full cut",
    scientificName: "Asparagus" },
  { crop: "Rhubarb", hardyToF: -35, emoji: "\u{1F33F}",
    category: "vegetable", perennial: true, note: "needs the cold to break dormancy",
    scientificName: "Rheum rhabarbarum" },
  { crop: "Horseradish", hardyToF: -35, emoji: "\u{1F33F}",
    category: "vegetable", perennial: true, note: "root it where you mean to keep it",
    scientificName: "Armoracia rusticana" },
  { crop: "Sunchoke", hardyToF: -30, emoji: "\u{1F33B}",
    category: "vegetable", perennial: true, note: "spreads; give it a corner",
    scientificName: "Helianthus tuberosus" },
  { crop: "Sorrel", hardyToF: -30, emoji: "\u{1F33F}",
    category: "vegetable", perennial: true, note: "first green of the spring",
    scientificName: "Rumex acetosa" },
  { crop: "Walking onion", hardyToF: -35, emoji: "\u{1F9C5}",
    category: "vegetable", perennial: true, note: "",
    scientificName: "Allium proliferum" },
  { crop: "Sea kale", hardyToF: -20, emoji: "\u{1F96C}",
    category: "vegetable", perennial: true, note: "",
    scientificName: "Crambe maritima" },

  // ── Herbs ─────────────────────────────────────────────────────────────
  //
  // Mostly perennial, and until now they had nowhere to be — basil sat under
  // Vegetable and everything else was simply missing. Rosemary is the one
  // worth reading the verdict on: it is a perennial that will not live
  // through a northern winter outdoors, and saying so plainly is more use
  // than leaving it off the list.
  { crop: "Sage", hardyToF: -30, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "",
    scientificName: "Salvia officinalis" },
  { crop: "Thyme", hardyToF: -30, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "",
    scientificName: "Thymus vulgaris" },
  { crop: "Oregano", hardyToF: -30, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "",
    scientificName: "Origanum vulgare" },
  { crop: "Mint", hardyToF: -35, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "container it or lose the bed",
    scientificName: "Mentha" },
  { crop: "Chives", hardyToF: -40, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "",
    scientificName: "Allium schoenoprasum" },
  { crop: "Lavender · English", hardyToF: -20, emoji: "\u{1FAB7}",
    category: "herb", perennial: true, note: "wants drainage more than it wants warmth",
    scientificName: "Lavandula angustifolia" },
  { crop: "Rosemary", hardyToF: 10, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "comes indoors north of zone 7",
    scientificName: "Salvia rosmarinus" },
  { crop: "Tarragon · French", hardyToF: -20, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "",
    scientificName: "Artemisia dracunculus" },
  { crop: "Lemon balm", hardyToF: -30, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "",
    scientificName: "Melissa officinalis" },
  { crop: "Winter savory", hardyToF: -20, emoji: "\u{1F33F}",
    category: "herb", perennial: true, note: "",
    scientificName: "Satureja montana" },
  { crop: "Cilantro", gddTarget: 500, baseTempF: 40, emoji: "\u{1F33F}",
    category: "herb", note: "bolts in heat; sow in succession", frostHardy: true,
    directSow: true, minSoilF: 45,
    scientificName: "Coriandrum sativum" },
  { crop: "Dill", gddTarget: 700, baseTempF: 40, emoji: "\u{1F33F}",
    category: "herb", note: "to head", frostHardy: true,
    directSow: true, minSoilF: 45,
    scientificName: "Anethum graveolens" },

  // ── Fruit trees and nuts ──────────────────────────────────────────────
  //
  // None carries a gddTarget, because none of them answers to one. That is a
  // fact about these plants and not a rule about perennials: alfalfa is a
  // perennial and does answer "750 GDD per cutting", and carries both.
  //
  // Every chill and hardiness figure below is a SPECIES-TYPICAL STARTING
  // POINT, and the spread inside a species is the whole reason it must be
  // edited: apple cultivars run from about 200 hours to over 1,000, and
  // rootstock, siting and the age of the tree all move the hardiness. The
  // authority is the nursery tag; these exist so the row is not empty.
  { crop: "Apple", chillHours: 800, hardyToF: -30, emoji: "\u{1F34E}",
    category: "orchard", perennial: true, note: "most northern cultivars",
    scientificName: "Malus" },
  { crop: "Apple \u00b7 low chill", chillHours: 250, hardyToF: -10, emoji: "\u{1F34E}",
    category: "orchard", perennial: true, note: "Anna, Dorsett Golden and kin",
    scientificName: "Malus" },
  { crop: "Pear \u00b7 European", chillHours: 700, hardyToF: -20, emoji: "\u{1F350}",
    category: "orchard", perennial: true, note: "Bartlett, Bosc and kin",
    scientificName: "Pyrus communis" },
  { crop: "Pear \u00b7 Asian", chillHours: 450, hardyToF: -15, emoji: "\u{1F350}",
    category: "orchard", perennial: true, note: "blooms early, frost-exposed",
    scientificName: "Pyrus pyrifolia" },
  { crop: "Cherry \u00b7 sweet", chillHours: 800, hardyToF: -20, emoji: "\u{1F352}",
    category: "orchard", perennial: true, note: "cracks in a wet harvest",
    scientificName: "Prunus avium" },
  { crop: "Cherry \u00b7 tart", chillHours: 1000, hardyToF: -30, emoji: "\u{1F352}",
    category: "orchard", perennial: true, note: "Montmorency and kin",
    scientificName: "Prunus cerasus" },
  { crop: "Plum \u00b7 European", chillHours: 800, hardyToF: -25, emoji: "\u{1F7E3}",
    category: "orchard", perennial: true, note: "prune and dessert types",
    scientificName: "Prunus domestica" },
  { crop: "Peach", chillHours: 850, hardyToF: -12, emoji: "\u{1F351}",
    category: "orchard", perennial: true, note: "bud-hardiness is the limit, not wood",
    scientificName: "Prunus persica" },
  { crop: "Apricot", chillHours: 700, hardyToF: -15, emoji: "\u{1F351}",
    category: "orchard", perennial: true, note: "earliest bloom of the stone fruits",
    scientificName: "Prunus armeniaca" },
  { crop: "Quince", chillHours: 300, hardyToF: -10, emoji: "\u{1F34F}",
    category: "orchard", perennial: true, note: "",
    scientificName: "Cydonia oblonga" },
  { crop: "Fig", chillHours: 100, hardyToF: 10, emoji: "\u{1FAD2}",
    category: "orchard", perennial: true, note: "wants wrapping or a wall north of zone 7",
    scientificName: "Ficus carica" },
  { crop: "Citrus", chillHours: 0, hardyToF: 26, emoji: "\u{1F34B}",
    category: "orchard", perennial: true, note: "needs no chill; loses fruit at a freeze",
    scientificName: "Citrus" },
  { crop: "Persimmon \u00b7 American", chillHours: 150, hardyToF: -25, emoji: "\u{1F383}",
    category: "orchard", perennial: true, note: "",
    scientificName: "Diospyros virginiana" },
  { crop: "Pawpaw", chillHours: 400, hardyToF: -25, emoji: "\u{1F96D}",
    category: "orchard", perennial: true, note: "understory native, wants two for pollen",
    scientificName: "Asimina triloba" },
  { crop: "Hazelnut", chillHours: 800, hardyToF: -25, emoji: "\u{1F330}",
    category: "orchard", perennial: true, note: "wind-pollinated, catkins in late winter",
    scientificName: "Corylus avellana" },
  { crop: "Chestnut", chillHours: 400, hardyToF: -20, emoji: "\u{1F330}",
    category: "orchard", perennial: true, note: "Chinese and hybrid types",
    scientificName: "Castanea dentata" },
  { crop: "Walnut \u00b7 black", chillHours: 800, hardyToF: -30, emoji: "\u{1F330}",
    category: "orchard", perennial: true, note: "juglone: nothing sensitive under it",
    scientificName: "Juglans nigra" },
  { crop: "Elderberry", chillHours: 600, hardyToF: -35, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "",
    scientificName: "Sambucus canadensis" },
  { crop: "Blueberry \u00b7 highbush", chillHours: 800, hardyToF: -25, emoji: "\u{1FAD0}",
    category: "orchard", perennial: true, note: "wants an acid soil more than it wants heat",
    scientificName: "Vaccinium corymbosum" },

  // ── Forest ────────────────────────────────────────────────────────────
  //
  // No chill figure. A forest tree is not being asked to set fruit, so the
  // question it answers is hardiness and presence — what is growing here, and
  // whether something considered for planting would live. Leaf-out, fall
  // colour and the sap run are the tree year, and belong to `tree_year`.
  { crop: "Maple \u00b7 sugar", hardyToF: -40, emoji: "\u{1F341}",
    category: "forest", perennial: true, note: "the sugarbush; runs on freeze and thaw",
    scientificName: "Acer saccharum" },
  { crop: "Maple \u00b7 red", hardyToF: -40, emoji: "\u{1F341}",
    category: "forest", perennial: true, note: "runs earlier and shorter than sugar",
    scientificName: "Acer rubrum" },
  { crop: "Birch \u00b7 yellow", hardyToF: -40, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "",
    scientificName: "Betula alleghaniensis" },
  { crop: "Birch \u00b7 paper", hardyToF: -45, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "",
    scientificName: "Betula papyrifera" },
  { crop: "Ash \u00b7 white", hardyToF: -40, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "watch emerald ash borer on the Pests page",
    scientificName: "Fraxinus americana" },
  { crop: "Oak \u00b7 red", hardyToF: -35, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "",
    scientificName: "Quercus rubra" },
  { crop: "Oak \u00b7 white", hardyToF: -30, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "",
    scientificName: "Quercus alba" },
  { crop: "Beech \u00b7 American", hardyToF: -35, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "",
    scientificName: "Fagus grandifolia" },
  { crop: "Cherry \u00b7 black", hardyToF: -35, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "timber; the fruit is the birds\u2019",
    scientificName: "Prunus serotina" },
  { crop: "Hickory \u00b7 shagbark", hardyToF: -30, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "",
    scientificName: "Carya ovata" },
  { crop: "Basswood", hardyToF: -40, emoji: "\u{1F333}",
    category: "forest", perennial: true, note: "the bees\u2019 midsummer flow",
    scientificName: "Tilia americana" },
  { crop: "Pine \u00b7 white", hardyToF: -40, emoji: "\u{1F332}",
    category: "forest", perennial: true, note: "",
    scientificName: "Pinus strobus" },
  { crop: "Hemlock \u00b7 eastern", hardyToF: -35, emoji: "\u{1F332}",
    category: "forest", perennial: true, note: "",
    scientificName: "Tsuga canadensis" },
  { crop: "Fir \u00b7 balsam", hardyToF: -45, emoji: "\u{1F332}",
    category: "forest", perennial: true, note: "",
    scientificName: "Abies balsamea" },
  { crop: "Spruce \u00b7 red", hardyToF: -45, emoji: "\u{1F332}",
    category: "forest", perennial: true, note: "",
    scientificName: "Picea rubens" },
  { crop: "Tamarack", hardyToF: -50, emoji: "\u{1F332}",
    category: "forest", perennial: true, note: "the conifer that drops its needles",
    scientificName: "Larix laricina" },
];

/// The library split by what each entry CAN BE ASKED — not into two halves.
///
/// A plant is rated on heat if it carries a target, and on winter if it is a
/// perennial, and **these overlap**. Alfalfa is a perennial that also answers
/// "750 GDD per cutting"; hops the same. Treating the two as a partition was
/// the error that kept perennials out of the catalogue in the first place —
/// it assumed a plant could only be one kind of thing.
///
/// Membership is by what an entry carries rather than by its category, so
/// nothing can leak into a call that would have to invent the figure it is
/// missing.
export const HEAT_RATED = CROP_PRESETS.filter(
  (c) => c.gddTarget != null && c.baseTempF != null,
);
export const WINTER_RATED = CROP_PRESETS.filter((c) => c.perennial);

export const CROP_CATEGORIES: { key: CropPreset["category"]; label: string }[] = [
  { key: "field", label: "Field" },
  { key: "vegetable", label: "Vegetable" },
  { key: "flower", label: "Cut flower" },
  { key: "cover", label: "Cover" },
  { key: "orchard", label: "Fruit" },
  { key: "herb", label: "Herb" },
  { key: "forest", label: "Forest" },
];

/// Validate the way the server does, so a grower is corrected in the form
/// rather than by a failed paid call.
///
/// A heat target and a set-out date are required of an ANNUAL and optional of
/// a perennial. `crops.validate_planting` has always allowed the absence — it
/// returns a presence row rather than raising — but this refused it, so the
/// only way to record a tree was to save an annual and then edit both fields
/// back out. An apple planted in 2019 has no set-out this season and no target
/// anyone counts, and both of those are true things to record.
export function makePlanting(
  crop: string,
  gddTarget: number | undefined,
  setOut: string,
  regionId: string,
  baseTempF?: number,
  extra?: Pick<Planting, "perennial" | "chillHours" | "hardyToF" | "scientificName">,
): Planting | string {
  if (!crop.trim()) return "Give the planting a crop name.";
  const perennial = !!extra?.perennial;

  if (gddTarget != null && (!Number.isFinite(gddTarget) || gddTarget < 1 || gddTarget > 20_000))
    return "GDD target should be a realistic number of degree days.";
  if (!perennial && gddTarget == null)
    return "GDD target should be a realistic number of degree days.";

  if (setOut && (!/^\d{4}-\d{2}-\d{2}$/.test(setOut) || Number.isNaN(Date.parse(setOut))))
    return "Set-out date must be YYYY-MM-DD.";
  if (!perennial && !setOut) return "Set-out date must be YYYY-MM-DD.";

  if (baseTempF != null && (baseTempF < 20 || baseTempF > 80))
    return "Base temperature must be between 20 and 80 °F.";
  if (extra?.chillHours != null && (extra.chillHours < 0 || extra.chillHours > 2_000))
    return "Chill hours should be between 0 and 2,000.";
  if (extra?.hardyToF != null && (extra.hardyToF < -60 || extra.hardyToF > 40))
    return "Hardiness should be between -60 and 40 °F.";

  return {
    id: `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    crop: crop.trim(), setOut, regionId,
    ...(gddTarget != null ? { gddTarget } : {}),
    ...(baseTempF != null ? { baseTempF } : {}),
    ...(perennial ? { perennial: true } : {}),
    ...(extra?.chillHours != null ? { chillHours: extra.chillHours } : {}),
    ...(extra?.hardyToF != null ? { hardyToF: extra.hardyToF } : {}),
    ...(extra?.scientificName ? { scientificName: extra.scientificName } : {}),
  };
}

/// The icon for a crop name, for the ledger rows.
///
/// A planting's crop is free text — a grower writes "Zinnia · succession 4",
/// not a preset key — so an exact lookup alone would leave most real rows
/// unmarked. Falling back to the longest preset name contained in the string
/// matches the successions and the notes people actually type, and a seedling
/// stands in for anything the catalogue has never heard of. Never guesses by
/// prefix alone: "corn" must not claim "cornflower".
export function emojiFor(crop: string): string {
  const name = crop.trim().toLowerCase();
  if (!name) return SEEDLING;

  for (const p of CROP_PRESETS) {
    if (p.crop.toLowerCase() === name) return p.emoji;
  }

  let best: CropPreset | undefined;
  for (const p of CROP_PRESETS) {
    // Match on the head term, before any " · " qualifier, and only on a whole
    // word — otherwise "Hemp · grain" would match against "hemp" inside an
    // unrelated word and mark the wrong row.
    const head = p.crop.split("·")[0].trim().toLowerCase();
    if (!head) continue;
    if (!new RegExp(`(^|[^a-z])${escapeRe(head)}([^a-z]|$)`).test(name)) continue;
    if (!best || head.length > best.crop.split("·")[0].trim().length) best = p;
  }
  return best?.emoji ?? SEEDLING;
}

const SEEDLING = "\u{1F331}";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/// The date a planting added from a sowing row should carry.
///
/// The row's whole point is its out date, so that is the date to use — but
/// only while it is still ahead. A window that opened in April cannot be when
/// an August tap put the crop in the ground, and dating it there would
/// backdate the heat the ledger goes on to count against the target. Both
/// arguments are YYYY-MM-DD, which compares correctly as text.
export function plantingDateFor(earliestOut: string | null | undefined, today: string): string {
  return earliestOut && earliestOut > today ? earliestOut : today;
}

// ── The record ───────────────────────────────────────────────────────────
//
// Plantings live on the block now, not in this browser. The codec is the only
// place that knows how a Planting maps onto a stored item, so the views keep
// working in their own shape.

import type { ItemCodec } from "./blockItems";
import type { ItemRow } from "./mcp";

export const plantingCodec: ItemCodec<Planting> = {
  from: (r: ItemRow): Planting => ({
    id: String(r.item_id),
    crop: String(r.crop ?? ""),
    // Never fabricate a target. A missing one meant 0 here, which the server
    // then rejected as "outside any real crop's range" — and one such row took
    // the whole ledger down. Absent stays absent.
    gddTarget: r.gdd_target == null ? undefined : Number(r.gdd_target),
    // A presence row has no set-out: the crop grows here and when it went in
    // is not known. Empty string rather than a fabricated date.
    setOut: String(r.set_out ?? ""),
    baseTempF: r.base_temp == null ? undefined : Number(r.base_temp),
    // A perennial is inferred from what it carries, not from a flag alone, so
    // a tree saved through the MCP by an agent that knew only its chill figure
    // still reads back as one.
    perennial: r.perennial === true || r.chill_hours != null || r.hardy_to_f != null
      ? true : undefined,
    chillHours: r.chill_hours == null ? undefined : Number(r.chill_hours),
    hardyToF: r.hardy_to_f == null ? undefined : Number(r.hardy_to_f),
    regionId: String(r.block_id ?? ""),
    scientificName: r.scientific_name ? String(r.scientific_name) : undefined,
  }),
  to: (p: Planting) => ({
    ...(p.id ? { item_id: p.id } : {}),
    crop: p.crop,
    ...(p.gddTarget != null ? { gdd_target: p.gddTarget } : {}),
    ...(p.setOut ? { set_out: p.setOut } : {}),
    ...(p.baseTempF != null ? { base_temp: p.baseTempF } : {}),
    ...(p.perennial ? { perennial: true } : {}),
    ...(p.chillHours != null ? { chill_hours: p.chillHours } : {}),
    ...(p.hardyToF != null ? { hardy_to_f: p.hardyToF } : {}),
    ...(p.scientificName ? { scientific_name: p.scientificName } : {}),
  }),
};
