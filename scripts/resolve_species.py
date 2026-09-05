"""Resolve the crop presets' retail names to scientific names, once.

**Why a script and not a live call.** A retail name is ambiguous and the
resolver ranks by how often a thing is *observed*, so a common wild lookalike
outranks the crop: bare "fig" comes back Opuntia (a cactus), bare "aronia"
comes back Amelanchier, and bare "black currant" comes back Ribes americanum
rather than the Ribes nigrum a grower actually planted. Resolving live would
put those answers in front of a grower with nobody having looked at them, and
attach another species' phenophases to their tree.

So the REST call does the work and a human reads the result: run this, read the
table, paste the block into `frontend/src/lib/plantings.ts`. Adding a preset
means running it again for that one name, not typing a binomial from memory.

    uv run python scripts/resolve_species.py            # every preset
    uv run python scripts/resolve_species.py Fig Pawpaw # just these

Two feeds, doing different jobs:

- **iNaturalist** is the vernacular-to-scientific dictionary. Constrained to
  descendants of Plantae so a moth or a shark named after a plant cannot win.
- **USA-NPN's species list** says whether that binomial is one NPN tracks
  phenophases for, which is the whole point of carrying the name. A miss here
  is not an error: it means Good Earth has no life-cycle stages to offer for
  that plant and will say so.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

import httpx

PRESETS = Path(__file__).resolve().parents[1] / "frontend/src/lib/plantings.ts"

INAT = "https://api.inaturalist.org/v1/taxa"
#: Plantae. `iconic_taxa=Plantae` does NOT filter this endpoint — asking it for
#: "Sweet William" still returns a shark of that name, ranked above the pink.
#: The ancestor id does filter, so it is what constrains the search.
PLANTAE = 47126
NPN = "https://services.usanpn.org/npn_portal/species/getSpecies.json"

#: Where the shelf name is not what to ask the dictionary. Each entry is a
#: better QUESTION, never a hard-coded answer — the feed still decides.
#: Mostly cultivated plants whose wild cousins are observed far more often.
ASK_INSTEAD = {
    # Fruit and nuts: the shelf name is a cultivar group, and the wild cousin
    # that shares it is observed ten times more often.
    "Apple": "apple",
    "Apple · low chill": "apple",
    "Pear · European": "European pear",
    "Pear · Asian": "Asian pear",
    "Cherry · tart": "sour cherry",
    "Quince": "common quince",
    "Fig": "common fig",
    "Citrus": "Citrus",
    "Hazelnut": "common hazel",
    "Chestnut": "American chestnut",
    "Elderberry": "American black elderberry",
    "Blueberry · highbush": "Northern highbush blueberry",
    "Raspberry · summer": "red raspberry",
    "Raspberry · fall": "red raspberry",
    "Blackberry": "Rubus fruticosus",
    "Currant · black": "blackcurrant",
    "Gooseberry": "European gooseberry",
    "Grape · cold-hardy": "wine grape",
    "Kiwi · hardy": "hardy kiwifruit",
    "Aronia": "black chokeberry",
    # Forest: the plain name is a genus of forty.
    "Pine · white": "eastern white pine",
    "Oak · red": "northern red oak",
    "Basswood": "American basswood",
    # Elsewhere in the catalogue, where a vernacular resolves to a weed or a
    # wildflower that carries the same folk name. Asking the binomial is still
    # a question the feed answers — it confirms the name is accepted, and the
    # verification below still has to agree.
    "Buckwheat": "common buckwheat",
    "Sweet William": "Dianthus barbatus",
    "Feverfew": "Tanacetum parthenium",
    "Sea kale": "Crambe maritima",
    "Marigold": "Tagetes",
    "Hellebore": "Helleborus",
    "Sorrel": "Rumex acetosa",
    # Field, vegetable and herb: a grocery word, or a folk name a wildflower
    # also carries. Asking the accepted name is still a question the feed
    # answers — it confirms the name exists and the check below still applies.
    "Field corn · short season": "Zea mays",
    "Field corn · long season": "Zea mays",
    "Silage corn": "Zea mays",
    "Sweet corn": "Zea mays",
    "Winter wheat": "Triticum aestivum",
    "Barley": "Hordeum vulgare",
    "Winter rye": "Secale cereale",
    "Hemp · grain": "Cannabis sativa",
    "Hemp · fibre": "Cannabis sativa",
    "Field peas": "Pisum sativum",
    "Dry bean": "Phaseolus vulgaris",
    "Pumpkin": "Cucurbita pepo",
    "Potato": "Solanum tuberosum",
    "Garlic": "Allium sativum",
    "Onion": "Allium cepa",
    "Carrot": "Daucus carota",
    "Brassicas": "Brassica",
    "Daikon radish": "Raphanus",
    "Basil": "Ocimum basilicum",
    "Hot pepper": "Capsicum",
    "Lily · Asiatic": "Lilium",
    "Daffodil": "Narcissus",
    "Sage": "Salvia officinalis",
    "Thyme": "Thymus vulgaris",
    "Mint": "Mentha",
    "Dill": "Anethum graveolens",
    "Tarragon · French": "Artemisia dracunculus",
    "Walking onion": "Allium proliferum",
    "Cranberry": "Vaccinium macrocarpon",
    # Cut flowers, where the grower plants a cultivar and the genus is the
    # truthful answer.
    "Sunflower · cut": "Helianthus annuus",
    "Sweet pea": "Lathyrus odoratus",
    "Larkspur": "Delphinium",
    "Amaranth": "Amaranthus",
    "Peony": "Paeonia",
    "Tulip": "Tulipa gesneriana",
    "Iris · bearded": "Iris",
    "Chrysanthemum · hardy": "Chrysanthemum",
    "Strawberry · June": "Fragaria",
    "Strawberry · everbearing": "Fragaria",
}


def phrase(crop: str) -> str:
    """The question to ask. "Maple · sugar" is shelf order; "sugar maple" is a name."""
    if crop in ASK_INSTEAD:
        return ASK_INSTEAD[crop]
    parts = [p.strip() for p in crop.split("·")]
    return f"{parts[1]} {parts[0]}" if len(parts) == 2 else parts[0]


def presets() -> list[dict[str, Any]]:
    src = PRESETS.read_text(encoding="utf-8")
    body = src[src.index("export const CROP_PRESETS"):src.index("export const CROP_CATEGORIES")]
    out = []
    for m in re.finditer(r'\{\s*crop:\s*"([^"]+)"(.*?)\},', body, re.DOTALL):
        raw, rest = m.group(1), m.group(2)
        crop = re.sub(r"\\u([0-9a-fA-F]{4})",
                      lambda m: chr(int(m.group(1), 16)), raw)
        cat = re.search(r'category:\s*"([^"]+)"', rest)
        out.append({"crop": crop, "category": cat.group(1) if cat else "",
                    "perennial": "perennial: true" in rest})
    return out


#: iNaturalist asks for one request a second and throttles a burst with a 429.
#: One at a time, paced, is the whole rate-limit story for a script that runs
#: for two minutes once a season.
_PACE = asyncio.Semaphore(1)


async def resolve(client: httpx.AsyncClient, q: str) -> list[dict[str, Any]]:
    async with _PACE:
        r = await client.get(INAT, params={
            "q": q, "taxon_id": PLANTAE, "rank": "species,genus", "per_page": 3})
        await asyncio.sleep(1.1)
    r.raise_for_status()
    return r.json().get("results", [])


async def npn_index(client: httpx.AsyncClient) -> dict[str, dict[str, Any]]:
    r = await client.get(NPN, timeout=60.0)
    r.raise_for_status()
    idx = {}
    for s in r.json():
        g, sp = (s.get("genus") or "").strip(), (s.get("species") or "").strip()
        if g and sp:
            idx[f"{g} {sp}".lower()] = s
    return idx


def fold(s: str) -> str:
    """Case, accents and hyphens off, so 'Hellebore' can meet 'Hellébore' and
    'Sweet William' can meet 'Sweet-William'."""
    flat = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", flat.replace("-", " ").lower()).strip()


def verified(asked: str, results: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The hit whose own name IS what we asked, not merely what ranked first.

    iNaturalist orders by how often a thing is observed, so bare "apple" leads
    with Solanum (bitter-apples) and the Malus a grower means is second. The
    API reports which of a taxon's names matched; requiring that to equal the
    question turns a ranking into an identification. Nothing matches, nothing
    is returned — a blank is a better preset than a plausible wrong binomial.
    """
    for t in results:
        if fold(str(t.get("matched_term") or "")) == fold(asked):
            return t
    return None


async def main(argv: list[str]) -> int:
    wanted = set(argv[1:])
    rows = [p for p in presets() if not wanted or p["crop"] in wanted]
    async with httpx.AsyncClient(timeout=30.0) as client:
        npn = await npn_index(client)
        hits = await asyncio.gather(
            *(resolve(client, phrase(p["crop"])) for p in rows), return_exceptions=True)

    table, review = [], []
    for p, got in zip(rows, hits, strict=True):
        if isinstance(got, BaseException) or not got:
            review.append((p["crop"], phrase(p["crop"]), f"no answer ({got or 'empty'})"))
            continue
        top = verified(phrase(p["crop"]), got)
        if top is None:
            review.append((p["crop"], phrase(p["crop"]),
                           "no exact name match; ranked: "
                           + ", ".join(f"{t.get('name')}<-{t.get('matched_term')!r}"
                                       for t in got[:3])))
            continue
        name = top.get("name") or ""
        tracked = fold(name) in npn
        table.append({
            "crop": p["crop"], "asked": phrase(p["crop"]), "name": name,
            "rank": top.get("rank"), "common": top.get("preferred_common_name"),
            "npn": tracked, "category": p["category"],
            "runners_up": [t.get("name") for t in got[1:]],
        })
        # A genus is a real answer for a cultivar group with no single species,
        # and it is also what you get when the dictionary shrugged. Read them.
        if top.get("rank") != "species":
            review.append((p["crop"], phrase(p["crop"]), f"genus: {name}"))

    print(f"{'preset':28} {'asked':26} {'resolved':30} rank     NPN")
    print("-" * 100)
    for t in table:
        print(f"{t['crop']:28.28} {t['asked']:26.26} {t['name']:30.30} "
              f"{t['rank']!s:8.8} {'yes' if t['npn'] else '—'}")
    if review:
        print("\nREAD THESE — a genus, or nothing came back:")
        for c, q, why in review:
            print(f"  {c:28.28} asked {q!r}: {why}")
    n = sum(1 for t in table if t["npn"])
    print(f"\n{len(table)} resolved, {n} tracked by USA-NPN, {len(review)} to read.")
    # Beside the script and not committed. The answer that matters is the one
    # pasted into the presets; a JSON snapshot nothing reads back would go
    # stale and start contradicting the file that ships.
    out = Path(__file__).parent / "resolved.json"
    out.write_text(json.dumps(table, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    print(f"Full table: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv)))
