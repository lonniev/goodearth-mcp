"""No wildlife row, however labelled, may stop the feed from building.

Reported 2026-09-04 against Frogdale Farm: `calendar_dataset` failed with
"Tool execution failed" after thirteen wildlife rows were saved, and the block
could not rebuild its feed at all. The reporter's hypothesis was that an
UNRECOGNISED event name took an unhandled path.

It was narrower than that, and in the opposite direction. Nothing resolves an
event name — the label is free text and the DRIVER dates it, so "rut onset" is
as datable as "first arrival". The crash was a row with **no event name at
all**: `validate_event` accepts that on purpose and gives it the driver
`roster`, `wildlife_window` filters those out before computing, and this path
did not — so it fell through a driver dispatch whose last branch was
`else: # daylight` and asked a roster row for `daylight_hours`.

Both halves are held here: the roster row, and the fall-through itself.
"""

from __future__ import annotations

import asyncio
import math
from datetime import date, timedelta

import pytest

from goodearth_mcp import block_store, calendar_feed, record_cache
from goodearth_mcp import region as reg

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 9, 4)


def _season(start: str, end: str) -> dict:
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    days = [a + timedelta(days=i) for i in range((b - a).days + 1)]
    hi, lo = [], []
    for d in days:
        p = math.cos((d.timetuple().tm_yday - 196) / 365 * 2 * math.pi)
        hi.append(round(55 + 28 * p, 1))
        lo.append(round(35 + 26 * p, 1))
    return {
        "daily": {
            "time": [d.isoformat() for d in days],
            "temperature_2m_max": hi, "temperature_2m_min": lo,
            "daylight_duration": [43200.0] * len(days),
            "sunrise": [f"{d.isoformat()}T06:00" for d in days],
            "sunset": [f"{d.isoformat()}T18:00" for d in days],
            "precipitation_sum": [0.0] * len(days),
            "dew_point_2m_mean": [40.0] * len(days),
        },
        "_feed": {"name": "synthetic (test)", "resolution_m": 1000},
    }


@pytest.fixture(autouse=True)
def _ground(monkeypatch):
    async def daily(lats, lons, s, e):
        return [_season(s, e) for _ in (lats or [0])]

    async def almanac(lat, lon, s, e):
        return _season(s, e)

    async def normals(lat, lon, s, e):
        return [_season(s, e)], "synthetic (test)", 1000

    monkeypatch.setattr(record_cache, "daily_history", daily)
    monkeypatch.setattr(record_cache, "almanac_history", almanac)
    monkeypatch.setattr(record_cache, "normals_history", normals)
    yield


def build(rows):
    return asyncio.run(calendar_feed.build_feed(
        REGION, "Frogdale Farm", "7355b20d", wildlife_events=rows, today=TODAY))


def reasons(out) -> dict[str, str]:
    return {s["name"]: s["reason"] for s in out["skipped"]}


# ── The crash ────────────────────────────────────────────────────────────


def test_a_creature_recorded_with_no_event_does_not_take_down_the_feed():
    """THE REPORTED BUG. One row like this made the whole block's feed
    unbuildable — seventeen other events and six to-dos with it."""
    out = build([{"species": "Great blue heron"}])
    assert out["ics"]
    assert "Great blue heron" in reasons(out)


def test_it_says_WHY_rather_than_vanishing():
    """A grower looking for the heron on their calendar is owed the reason it
    is not there."""
    out = build([{"species": "Great blue heron"}])
    assert "names no event" in reasons(out)["Great blue heron"]


def test_one_such_row_does_not_cost_the_others():
    """The failure that made this High severity: the feed lost everything."""
    out = build([
        {"species": "Great blue heron"},
        {"species": "White-tailed deer", "event": "rut onset",
         "driver": "calendar", "typical_on": "11-05"},
        {"species": "Snowy owl", "event": "first arrival",
         "driver": "calendar", "typical_on": "12-01"},
    ])
    assert out["counts"]["wildlife"] == 2
    assert out["counts"]["frost"] > 0


# ── The premise the report rested on ─────────────────────────────────────


def test_an_UNRECOGNISED_event_name_dates_perfectly_well():
    """Nothing resolves an event name. The label is the grower's own words and
    the DRIVER dates it, so "rut onset" is exactly as datable as "first
    arrival" — which is why the reported trigger was not the real one.
    """
    out = build([{"species": "White-tailed deer", "event": "rut onset",
                  "driver": "calendar", "typical_on": "11-05"}])
    assert out["counts"]["wildlife"] == 1
    assert not out["skipped"]


def test_a_row_with_an_event_but_no_driver_was_ALREADY_skipped_politely():
    out = build([{"species": "Spotted salamander", "event": "Big Night crossing"}])
    assert "driver must be one of" in reasons(out)["Spotted salamander"]


# ── The fall-through that let it happen ──────────────────────────────────


def test_a_driver_this_loop_does_not_know_is_named_not_assumed(monkeypatch):
    """The branch used to read `else: # daylight`, so ANY unknown driver was
    handed to the daylight reader and asked for a field it had no reason to
    carry. A driver added to `wildlife.DRIVERS` and not to this loop is a gap
    in this file, and it must report itself rather than crash the feed.
    """
    monkeypatch.setattr(
        calendar_feed.wildlife, "DRIVERS",
        {*calendar_feed.wildlife.DRIVERS, "tide"},
    )
    monkeypatch.setattr(
        calendar_feed.wildlife, "validate_event",
        lambda ev: {"species": ev["species"], "event": ev["event"], "driver": "tide",
                    "note": "", "emoji": None},
    )
    out = build([{"species": "Horseshoe crab", "event": "spawning run"}])
    assert out["ics"]
    assert "no way to date" in reasons(out)["Horseshoe crab"]


def test_every_driver_the_validator_accepts_can_be_dated():
    """The structural guard. `wildlife.DRIVERS` and this loop's dispatch are
    two lists that must agree, and they drifted once already.
    """
    rows = [
        {"species": "A", "event": "e", "driver": "heat", "gdd": 900, "base_temp": 50},
        {"species": "B", "event": "e", "driver": "calendar", "typical_on": "05-01"},
        {"species": "C", "event": "e", "driver": "interval", "days": 30, "from": "2026-04-01"},
        {"species": "D", "event": "e", "driver": "daylight", "daylight_hours": 13, "rising": True},
        {"species": "E", "event": "e", "driver": "condition",
         "trigger": {"after": "03-01", "min_night_f": 40}},
    ]
    assert {r["driver"] for r in rows} == calendar_feed.wildlife.DRIVERS
    out = build(rows)
    assert not out["skipped"], out["skipped"]
    assert out["counts"]["wildlife"] == len(rows)
