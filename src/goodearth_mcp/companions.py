"""Companion planting — two different questions with two different answers.

**Synergy** is a set of published rules over plant *families and genera*:
which neighbours fix the nitrogen a heavy feeder draws down, which flowers
feed the wasps that take the aphids, which roots poison the ground beside
them. Every rule here names its mechanism or its tradition and a citation,
because a rule a grower cannot audit is just this file's opinion. Good Earth
computes against the grower's ground; these rules it *publishes*, and says so.

**Design** is arithmetic over what the grower recorded — flower colour,
height, bloom months. Opposite hues read as complementary, neighbours on the
wheel as analogous, white as a foil; a front plant layers in front of a back
one; two that bloom in the same months are seen together. No trait database
is consulted: a zinnia has no colour, *this* zinnia has the one she wrote in.

Pure: no I/O, no clock. The window module gathers the ledger and the taxa.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

KINDS = ("synergy", "design")

# ── Taxa ─────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Taxon:
    """A plant as the rules see it: a family, a genus, and a name to show."""

    name: str
    family: str | None = None
    genus: str | None = None
    scientific_name: str | None = None
    taxon_id: int | None = None

    @property
    def placed(self) -> bool:
        return bool(self.family)

    def matches(self, names: frozenset[str] | None) -> bool:
        """``None`` means "any plant that has been placed"."""
        if names is None:
            return self.placed
        return bool((self.family and self.family in names) or (self.genus and self.genus in names))


# ── Synergy rules ────────────────────────────────────────────────────────

RIOTTE = "Riotte, L. Carrots Love Tomatoes (1975); Wikipedia, List of companion plants (CC BY-SA)"


@dataclass(frozen=True)
class Rule:
    """``subject`` → ``partners``. ``partners=None`` means every placed plant.

    ``relation`` is read from the subject's side: ``helps`` means the subject
    does the partner good; ``avoid`` is mutual. ``basis`` is ``mechanism`` when
    the effect has a named cause and ``tradition`` when the claim rests on
    companion-planting practice rather than a measured mechanism.
    """

    subject: frozenset[str]
    partners: frozenset[str] | None
    relation: str
    why: str
    basis: str
    cite: str


def _r(subject: str, partners: str | None, relation: str, why: str, basis: str, cite: str) -> Rule:
    return Rule(
        frozenset(subject.split()),
        None if partners is None else frozenset(partners.split()),
        relation, why, basis, cite,
    )


HEAVY_FEEDERS = "Brassicaceae Solanaceae Cucurbitaceae Poaceae"

RULES: tuple[Rule, ...] = (
    _r("Fabaceae", HEAVY_FEEDERS, "helps",
       "rhizobia on the roots fix nitrogen the heavy feeders draw down",
       "mechanism", "symbiotic nitrogen fixation (Fabaceae–Rhizobium)"),
    _r("Apiaceae Asteraceae", "Brassicaceae Solanaceae Rosaceae", "helps",
       "open flowers feed the parasitoid wasps, hoverflies and lacewings that take aphids and caterpillars",
       "mechanism", "conservation biological control: floral resources for natural enemies"),
    _r("Allium", "Apiaceae Brassicaceae Rosaceae", "helps",
       "sulfur volatiles confuse carrot fly and aphids hunting by scent",
       "mechanism", "Allium sulfur volatiles masking host odour"),
    _r("Allium", "Fabaceae", "avoid",
       "tradition holds that onions and garlic check the growth of beans and peas",
       "tradition", RIOTTE),
    _r("Ocimum Thymus Salvia Mentha Origanum Rosmarinus", "Solanaceae Brassicaceae", "helps",
       "aromatic volatiles mask the host crop from pests that find it by scent (mint spreads — keep it potted)",
       "tradition", RIOTTE),
    _r("Tropaeolum", "Cucurbitaceae Brassicaceae", "helps",
       "a trap crop: aphids and cabbage white prefer nasturtium to the crop beside it",
       "tradition", RIOTTE),
    _r("Tagetes", "Solanaceae Apiaceae Amaranthaceae", "helps",
       "root exudate (alpha-terthienyl) suppresses root-knot nematodes",
       "mechanism", "Tagetes alpha-terthienyl nematode suppression"),
    _r("Zea", "Phaseolus Cucurbita", "helps",
       "the Three Sisters: the stalk carries the bean, the bean feeds the soil, the squash shades the ground",
       "tradition", "Three Sisters intercropping (Haudenosaunee practice); " + RIOTTE),
    _r("Phaseolus", "Cucurbita", "helps",
       "the Three Sisters: the bean feeds the soil the squash draws on",
       "tradition", "Three Sisters intercropping (Haudenosaunee practice); " + RIOTTE),
    _r("Juglans", None, "avoid",
       "juglone from the roots and leaf litter poisons most vegetables, nightshades and roses within the drip line and beyond",
       "mechanism", "juglone allelopathy (Juglans)"),
    _r("Foeniculum", None, "avoid",
       "fennel is allelopathic to most of the garden; tradition keeps it on its own",
       "tradition", RIOTTE),
)

SAME_FAMILY = Rule(
    frozenset(), None, "watch",
    "the same family shares pests and soil-borne disease, so what one carries the other inherits; the Rotation panel shows the seasons",
    "mechanism", "host-specific pests and soil pathogens persist within a plant family",
)


@dataclass(frozen=True)
class Example:
    """An ordinary garden member of a family, offered as an example only."""

    name: str
    scientific_name: str
    family: str
    genus: str


EXAMPLES: tuple[Example, ...] = (
    Example("bush bean", "Phaseolus vulgaris", "Fabaceae", "Phaseolus"),
    Example("pea", "Pisum sativum", "Fabaceae", "Pisum"),
    Example("crimson clover", "Trifolium incarnatum", "Fabaceae", "Trifolium"),
    Example("dill", "Anethum graveolens", "Apiaceae", "Anethum"),
    Example("cilantro", "Coriandrum sativum", "Apiaceae", "Coriandrum"),
    Example("calendula", "Calendula officinalis", "Asteraceae", "Calendula"),
    Example("cosmos", "Cosmos bipinnatus", "Asteraceae", "Cosmos"),
    Example("yarrow", "Achillea millefolium", "Asteraceae", "Achillea"),
    Example("French marigold", "Tagetes patula", "Asteraceae", "Tagetes"),
    Example("chive", "Allium schoenoprasum", "Amaryllidaceae", "Allium"),
    Example("garlic", "Allium sativum", "Amaryllidaceae", "Allium"),
    Example("basil", "Ocimum basilicum", "Lamiaceae", "Ocimum"),
    Example("thyme", "Thymus vulgaris", "Lamiaceae", "Thymus"),
    Example("nasturtium", "Tropaeolum majus", "Tropaeolaceae", "Tropaeolum"),
    Example("sweet corn", "Zea mays", "Poaceae", "Zea"),
    Example("winter squash", "Cucurbita maxima", "Cucurbitaceae", "Cucurbita"),
    Example("tomato", "Solanum lycopersicum", "Solanaceae", "Solanum"),
    Example("kale", "Brassica oleracea", "Brassicaceae", "Brassica"),
    Example("carrot", "Daucus carota", "Apiaceae", "Daucus"),
    Example("fennel", "Foeniculum vulgare", "Apiaceae", "Foeniculum"),
    Example("black walnut", "Juglans nigra", "Juglandaceae", "Juglans"),
)

#: Read from the subject's side. A rule that says the candidate helps the
#: subject is reported as ``helped_by``; the grower reads "beans feed this".
_FLIP = {"helps": "helped_by", "avoid": "avoid", "watch": "watch"}


def relate(subject: Taxon, other: Taxon) -> list[dict[str, Any]]:
    """Every rule that joins ``subject`` and ``other``, from the subject's side."""
    found: list[dict[str, Any]] = []
    if not subject.placed or not other.placed:
        return found
    for rule in RULES:
        if subject.matches(rule.subject) and other.matches(rule.partners):
            found.append(_row(rule, rule.relation))
        elif other.matches(rule.subject) and subject.matches(rule.partners):
            found.append(_row(rule, _FLIP[rule.relation]))
    if subject.family == other.family and not any(f["relation"] != "watch" for f in found):
        found.append(_row(SAME_FAMILY, "watch"))
    return found


def _row(rule: Rule, relation: str) -> dict[str, Any]:
    return {"relation": relation, "why": rule.why, "basis": rule.basis, "cite": rule.cite}


_ORDER = {"helped_by": 0, "helps": 1, "avoid": 2, "watch": 3}


def synergy(subject: Taxon, candidates: list[tuple[Taxon, dict[str, Any]]]) -> list[dict[str, Any]]:
    """Companion rows for ``subject`` among ``candidates``.

    Each candidate is a taxon plus the row's own facts (``where``, ``ref``,
    ``name``…) that travel through untouched. A candidate joined by several
    rules yields one row per rule. Keep-apart rows sort after the helpers so a
    glance reads the good news first; within a relation, ledger order holds.
    """
    rows: list[dict[str, Any]] = []
    for taxon, facts in candidates:
        if taxon.taxon_id is not None and taxon.taxon_id == subject.taxon_id and facts.get("where") != "example":
            continue
        for hit in relate(subject, taxon):
            rows.append({**facts, "family": taxon.family, "genus": taxon.genus, **hit})
    rows.sort(key=lambda r: _ORDER.get(r["relation"], 9))
    return rows


# ── Design ───────────────────────────────────────────────────────────────

WHEEL = ("red", "orange", "yellow", "green", "blue", "violet")
HUES = WHEEL + ("pink", "white")

#: Height bands, in inches: what stands in front, what stands behind.
BANDS = ((12, "front"), (30, "mid"))


def hue_index(color: str | None) -> int | None:
    """Where a colour sits on the six-step wheel; pink reads as light red."""
    if color == "pink":
        color = "red"
    return WHEEL.index(color) if color in WHEEL else None


def colour_relation(a: str | None, b: str | None) -> str | None:
    """complementary · analogous · foil · same · other, or None when either is unset."""
    if a not in HUES or b not in HUES:
        return None
    if a == "white" or b == "white":
        return "foil"
    ia, ib = hue_index(a), hue_index(b)
    assert ia is not None and ib is not None
    gap = min((ia - ib) % 6, (ib - ia) % 6)
    return {0: "same", 1: "analogous", 2: "other", 3: "complementary"}[gap]


def band(height_in: float | None) -> str | None:
    if height_in is None:
        return None
    for ceiling, name in BANDS:
        if height_in < ceiling:
            return name
    return "back"


def bloom_overlap(a: list[int] | None, b: list[int] | None) -> list[int] | None:
    """Months both bloom; None when either has none recorded."""
    if not a or not b:
        return None
    return sorted(set(a) & set(b))


@dataclass(frozen=True)
class Look:
    """What the grower wrote down about how a plant looks."""

    color: str | None = None
    height_in: float | None = None
    bloom_months: tuple[int, ...] = ()


_COLOUR_RANK = {"complementary": 0, "analogous": 1, "foil": 2, "other": 3, "same": 4}


def design(subject: Look, candidates: list[tuple[Look, dict[str, Any]]]) -> list[dict[str, Any]]:
    """Design rows for ``subject`` among ``candidates`` that have a colour.

    Ranked complementary first, then by whether the two stand in different
    bands and whether they bloom together; a candidate with no colour is
    skipped — nothing can be said about it, so nothing is.
    """
    rows: list[dict[str, Any]] = []
    for look, facts in candidates:
        rel = colour_relation(subject.color, look.color)
        if rel is None:
            continue
        sb, cb = band(subject.height_in), band(look.height_in)
        layers = (sb is not None and cb is not None and sb != cb)
        overlap = bloom_overlap(list(subject.bloom_months), list(look.bloom_months))
        rows.append({
            **facts,
            "relation": rel,
            "color": look.color,
            "band": cb,
            "layers": layers if (sb and cb) else None,
            "bloom_overlap": overlap,
            "why": _design_why(rel, subject.color, look.color, layers if (sb and cb) else None, cb, overlap),
            "basis": "grower",
            "cite": "your own entries: flower colour, height, bloom months",
        })
    rows.sort(key=lambda r: (
        _COLOUR_RANK.get(r["relation"], 9),
        0 if r["layers"] else 1,
        0 if r["bloom_overlap"] else 1,
    ))
    return rows


def _design_why(rel: str, a: str | None, b: str | None, layers: bool | None, cb: str | None, overlap: list[int] | None) -> str:
    colour = {
        "complementary": f"{b} sits opposite {a} on the wheel — the strongest contrast",
        "analogous": f"{b} sits beside {a} on the wheel — a quiet blend",
        "foil": "white is a foil: it rests the eye between any two colours",
        "same": f"the same {a} — a mass of one colour",
        "other": f"{b} against {a} — neither contrast nor blend",
    }[rel]
    parts = [colour]
    if layers is True and cb:
        parts.append(f"stands in the {cb}, a different layer")
    elif layers is False:
        parts.append("the same height — side by side, not layered")
    if overlap:
        parts.append("blooms in the same months")
    elif overlap == []:
        parts.append("their bloom months do not meet")
    return "; ".join(parts)


DESIGN_EXAMPLES: tuple[tuple[str, str, str, float], ...] = (
    # name, scientific name, colour, typical height in inches — classic cut
    # flowers, one or two a hue, offered as examples and labelled so.
    ("zinnia", "Zinnia elegans", "red", 30),
    ("California poppy", "Eschscholzia californica", "orange", 12),
    ("rudbeckia", "Rudbeckia hirta", "yellow", 30),
    ("bells of Ireland", "Moluccella laevis", "green", 30),
    ("bachelor's button", "Centaurea cyanus", "blue", 30),
    ("larkspur", "Consolida ajacis", "violet", 36),
    ("cosmos", "Cosmos bipinnatus", "pink", 48),
    ("sweet alyssum", "Lobularia maritima", "white", 6),
)


def validate_look(item: dict[str, Any]) -> dict[str, Any]:
    """Check the three design fields on a planting. Absent is absent; a value
    that IS given has to be one the wheel knows, a height, a month."""
    name = str(item.get("crop") or item.get("name") or "the planting")
    color = item.get("flower_color")
    if color not in (None, "") and color not in HUES:
        raise ValueError(f"{name}: flower_color must be one of {', '.join(HUES)}")
    height = item.get("height_in")
    if height not in (None, ""):
        try:
            h = float(height)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{name}: height_in must be a number of inches") from exc
        if not 0 < h <= 600:
            raise ValueError(f"{name}: height_in of {h:g} is outside any garden plant's range")
    months = item.get("bloom_months")
    if months not in (None, "") and (
        not isinstance(months, list) or not all(isinstance(m, int) and 1 <= m <= 12 for m in months)
    ):
        raise ValueError(f"{name}: bloom_months must be a list of month numbers 1–12")
    return item


def look_of(item: dict[str, Any]) -> Look:
    height = item.get("height_in")
    months = item.get("bloom_months")
    return Look(
        color=item.get("flower_color") or None,
        height_in=float(height) if isinstance(height, (int, float)) else None,
        bloom_months=tuple(m for m in months if isinstance(m, int)) if isinstance(months, list) else (),
    )
