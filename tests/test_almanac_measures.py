"""Every measure the almanac offers must be a field it actually asks for.

The coupling this guards is invisible: `MEASURES` names an Open-Meteo field,
and `_DAILY_ALMANAC_FORECAST` is the list of fields the request asks for. Add a
measure and forget the request string and nothing fails — the series simply
comes back empty, the chart draws a flat nothing, and it reads as "this ground
had no humidity" rather than as "nobody asked".
"""

from __future__ import annotations

from goodearth_mcp import sources
from goodearth_mcp.almanac_window import MEASURES, SECONDS_FIELDS


def requested() -> set[str]:
    return {f.strip() for f in sources._DAILY_ALMANAC_FORECAST.split(",") if f.strip()}


def test_every_measure_is_a_field_the_request_asks_for():
    missing = {k: m["field"] for k, m in MEASURES.items() if m["field"] not in requested()}
    assert not missing, f"offered but never requested: {missing}"


def test_the_history_asks_for_the_same_fields_as_the_forecast():
    """The record and the outlook are drawn on one chart. A field present in
    one and absent from the other draws a line that stops halfway."""
    history = {f.strip() for f in sources._DAILY_ALMANAC_HISTORY.split(",") if f.strip()}
    assert history == requested()


def test_humidity_is_offered_and_asked_for():
    assert MEASURES["humidity"]["field"] == "relative_humidity_2m_mean"
    assert "relative_humidity_2m_mean" in requested()


def test_humidity_is_a_percentage_and_is_not_accumulated():
    """Rain accumulates over a season and humidity does not — a running total
    of a percentage is not a quantity of anything."""
    assert MEASURES["humidity"]["unit"] == "%"
    assert MEASURES["humidity"]["accumulate"] is False


def test_only_the_duration_fields_are_read_as_seconds():
    """Open-Meteo reports sunshine and daylight in seconds and everything else
    in its own unit. Treating a percentage as seconds would divide it by 3600
    and report 0.02 % humidity."""
    assert SECONDS_FIELDS <= requested()
    assert MEASURES["humidity"]["field"] not in SECONDS_FIELDS
