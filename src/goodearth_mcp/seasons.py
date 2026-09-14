"""A grower's season, which does not end on December 31.

Several readers defaulted to "this calendar year" and so fell off a cliff at
midnight on Dec 31: a hen set on Dec 20 lost her Jan 10 hatch from the
calendar feed, a pest roster vanished from the review, and a field report
filed in December stopped counting toward calibration in January. The record
itself was never lost — every page that lists it asks for everything the
grower has not removed — but the readers that summarise it for a season
counted only the calendar year.

These are the rules those readers share instead. Pure; no I/O.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

#: How far back a field report still counts toward calibrating the ground,
#: when no season is named. A year: long enough that December counts in
#: January, short enough that six seasons of weather are not averaged into
#: one correction.
CALIBRATION_REACH_DAYS = 365

#: The field that dates a row for its season, per kind. A row without one is
#: timeless for this purpose — a pest counted from each year's own Jan 1, a
#: planting known only by its presence.
_DATED_BY = {"planting": "set_out", "pest": "biofix"}


def recent_observations(
    rows: list[dict[str, Any]], season: int | None, today: date,
) -> list[dict[str, Any]]:
    """The reports that calibrate this season: the named season's, or the
    last twelve months' when none is named."""
    if season is not None:
        return [o for o in rows if str(o.get("observed_on") or "").startswith(str(season))]
    since = (today - timedelta(days=CALIBRATION_REACH_DAYS)).isoformat()
    return [o for o in rows if str(o.get("observed_on") or "") >= since]


def feed_rows(kind: str, rows: list[dict[str, Any]], season_start: date) -> list[dict[str, Any]]:
    """The rows a calendar feed for the season starting ``season_start`` carries.

    Wildlife: all of them. A dated event carries its own date — a clutch set
    on Dec 20 hatches on Jan 10 whichever year's feed asks — and an annual one
    is re-dated to the year in hand.

    Plantings and pests: those dated in this season or later, and those with
    no date at all. A planting set out last June has its heat counted from
    this season's Jan 1 if it is let through — last summer's zinnias would
    reappear as this July's target date. That is a phantom, and a feed that
    publishes phantoms is worse than one that is quiet.
    """
    key = _DATED_BY.get(kind)
    if key is None:
        return list(rows)
    start = season_start.isoformat()
    return [r for r in rows if not r.get(key) or str(r[key])[:10] >= start]
