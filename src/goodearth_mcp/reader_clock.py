"""Whose today it is.

A grower reads their farm on their own clock. The server runs in UTC, and
UTC's date already says tomorrow after 7 pm in Vermont, so the season, the
due lists and the "days out" counts ran a day ahead every evening.

The clock is named once per request, at the tool boundary, the way the weather
cache is told whose request it serves. The windows below ask ``today()`` and
know nothing about patrons.

Which clock:
  1. the patron's ``timezone`` property, when it names an IANA zone;
  2. otherwise the ground's own zone, since "auto" means the browser's and the
     server cannot see a browser, and a grower is usually near their ground;
  3. otherwise UTC.
"""

from __future__ import annotations

from contextvars import ContextVar
from datetime import UTC, date, datetime, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_zone: ContextVar[str | None] = ContextVar("reader_zone", default=None)

#: The ground's zone by rounded centroid. A zone is a fact about a place.
_place_zones: dict[tuple[float, float], str] = {}


def as_zone(name: object) -> str | None:
    """``name`` when it is an IANA zone this server knows, else None."""
    if not isinstance(name, str):
        return None
    name = name.strip()
    if not name or name == "auto" or len(name) > 64:
        return None
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return None
    return name


def reading_in(zone: str | None) -> None:
    """Name the clock this request reads. Called at the tool boundary."""
    _zone.set(as_zone(zone))


def zone() -> tzinfo:
    """The clock this request reads, UTC when none was named."""
    name = _zone.get()
    return ZoneInfo(name) if name else UTC


def zone_name() -> str | None:
    return _zone.get()


def today() -> date:
    """Today on the reader's clock."""
    return datetime.now(zone()).date()


def remembered_place_zone(lat: float, lon: float) -> str | None:
    return _place_zones.get((round(lat, 2), round(lon, 2)))


def remember_place_zone(lat: float, lon: float, name: str) -> None:
    if as_zone(name):
        _place_zones[(round(lat, 2), round(lon, 2))] = name
