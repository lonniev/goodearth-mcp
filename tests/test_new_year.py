"""Planning across the new year.

A season that runs from October garlic to July harvest, a January frost on the
Gulf Coast, a hen set on Dec 20 — none of them end at midnight on Dec 31, and
each of these used to.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from goodearth_mcp import calibrate, frost, gdd, planting, record_cache, soil, wildlife
from goodearth_mcp.region import parse_region

# ── Feb 29 ───────────────────────────────────────────────────────────────


def test_feb_29_is_the_28th_in_a_common_year():
    assert gdd.on_year(2027, 2, 29) == date(2027, 2, 28)
    assert gdd.on_year(2028, 2, 29) == date(2028, 2, 29)


SOUTHERN_SPRING = ["2024-02-29", "2020-02-29", "2023-03-01"]


def test_a_typical_frost_on_feb_29_no_longer_breaks_the_frost_summary():
    assert frost.summarize_frost_dates(SOUTHERN_SPRING, 2027)["median"] == "2027-02-28"


def test_nor_the_soil_summary():
    assert soil.typical_crossing(SOUTHERN_SPRING, 2027)["median"] == "2027-02-28"


# ── A frost season that crosses the new year ─────────────────────────────


def test_a_january_first_frost_is_found():
    days = [date(2022, 7, 1) + timedelta(days=i) for i in range(250)]
    tmin = [20.0 if d == date(2023, 1, 12) else 40.0 for d in days]
    assert frost.first_fall_frost([d.isoformat() for d in days], tmin, 2022) == "2023-01-12"


def test_a_season_crossing_the_new_year_is_ordered_by_the_season():
    """January comes after December, not before October."""
    s = frost.summarize_frost_dates(["2021-10-20", "2022-10-22", "2024-01-12"], 2026)
    assert (s["earliest"], s["median"], s["latest"]) == ("2026-10-20", "2026-10-22", "2027-01-12")


def test_spring_dates_are_left_where_they_are():
    s = frost.summarize_frost_dates(["2021-04-20", "2022-04-28", "2023-05-02"], 2026)
    assert (s["earliest"], s["median"], s["latest"]) == ("2026-04-20", "2026-04-28", "2026-05-02")


def test_a_soil_warming_that_once_slipped_into_july_stays_in_this_year():
    """Ginger on Frogdale Farm, 2026-10-09: soil reached 65 °F in late June
    most seasons and on July 2 once. "Dates on both sides of July" read as a
    season crossing New Year, June went to 2027, the frost stayed in 2026,
    and the window came out −353 days — "will not fit" for a crop that fits."""
    hits = ["2017-06-14", "2018-06-20", "2019-06-25", "2020-06-11", "2021-06-18",
            "2022-06-22", "2023-06-16", "2024-06-19", "2025-07-02"]
    s = soil.typical_crossing(hits, 2026)
    assert s["median"] == "2026-06-19"
    assert s["earliest"] == "2026-06-11" and s["latest"] == "2026-07-02"


def test_the_window_for_a_june_soil_date_is_no_longer_a_year_wrong():
    today = date(2026, 10, 9)
    soil_ready = date.fromisoformat(soil.typical_crossing(
        ["2024-06-18", "2025-07-02", "2023-06-16"], 2026)["median"])
    clim = {(date(2024, 1, 1) + timedelta(days=i)).strftime("%m-%d"): 14.0 for i in range(366)}
    ginger = planting.validate({"crop": "Ginger", "gdd_target": 1400, "base_temp": 55,
                                "min_soil_f": 65})
    r = planting.assess(ginger, date(2026, 5, 4), date(2026, 10, 12), soil_ready, clim, today)
    assert r["earliest_out"] == "2026-06-18"
    assert r["window_days"] is not None and r["window_days"] > 0, r
    assert r["state"] != "will_not_fit"


def test_a_frost_season_that_truly_crosses_the_new_year_still_does():
    """The gap test keeps the January frost in the following year."""
    s = frost.summarize_frost_dates(["2021-10-20", "2022-10-22", "2023-12-30", "2024-01-12"], 2026)
    assert (s["earliest"], s["latest"]) == ("2026-10-20", "2027-01-12")


# ── The planting window in autumn ────────────────────────────────────────


def test_after_the_first_frost_the_planting_window_plans_next_spring():
    fall = date(2026, 10, 16)
    assert planting.plan_year(fall, date(2026, 11, 15)) == 2027
    assert planting.plan_year(fall, date(2026, 9, 14)) == 2026
    assert planting.plan_year(None, date(2026, 11, 15)) == 2026


def test_planned_for_next_year_the_dates_are_ahead_not_behind():
    """On Nov 15 the onion's dates are next year's, and successions return."""
    today = date(2026, 11, 15)
    season = planting.plan_year(date(2026, 10, 16), today)
    spring = frost.summarize_frost_dates(["2023-04-29", "2024-04-25", "2025-04-27"], season)
    fall = frost.summarize_frost_dates(["2023-10-18", "2024-10-14", "2025-10-16"], season)
    clim = {(date(2024, 1, 1) + timedelta(days=i)).strftime("%m-%d"): 12.0 for i in range(366)}
    onion = planting.validate({"crop": "Onion", "gdd_target": 1400, "base_temp": 40,
                               "frost_hardy": True, "start_indoors_weeks": 10, "succession_days": 21})
    r = planting.assess(onion, date.fromisoformat(spring["median"]),
                        date.fromisoformat(fall["median"]), None, clim, today)
    assert r["start_seed_indoors"] > today.isoformat()
    assert r["earliest_out"].startswith("2027-")
    assert r["successions"], "a season planned ahead has sowings to schedule"


# ── A brood's start ──────────────────────────────────────────────────────


def _calendar(**kw: Any) -> dict[str, Any]:
    return wildlife.validate_event({"species": "Domestic chicken", "event": "laying on eggs",
                                    "driver": "calendar", **kw})


def test_a_brood_start_keeps_its_own_day_across_the_new_year():
    r = wildlife.calendar_event(_calendar(typical_on="12-20", on="2026-12-20"), date(2027, 1, 5))
    assert r["reached_on"] == "2026-12-20"
    assert r["projected_date"] is None, "it happened; it is not next December"


def test_an_annual_date_is_still_re_dated_each_year():
    r = wildlife.calendar_event(_calendar(typical_on="04-02"), date(2027, 1, 5))
    assert r["projected_date"] == "2027-04-02"


# ── Calibration across the new year ──────────────────────────────────────


def _find(obj: Any, key: str) -> list[Any]:
    if isinstance(obj, dict):
        return ([obj[key]] if key in obj else []) + [v for x in obj.values() for v in _find(x, key)]
    if isinstance(obj, list):
        return [v for x in obj for v in _find(x, key)]
    return []


async def test_a_january_cut_is_measured_from_its_october_set_out(monkeypatch):
    """Greens sown Oct 1 and cut Jan 10 banked 100 days of heat, not ten."""
    async def fake(lats, lons, start, end):
        s, e = date.fromisoformat(start), date.fromisoformat(end)
        days = [s + timedelta(days=i) for i in range((e - s).days + 1)]
        return [{"elevation": 100.0, "daily": {
            "time": [d.isoformat() for d in days],
            "temperature_2m_max": [70.0] * len(days), "temperature_2m_min": [50.0] * len(days),
        }}]

    monkeypatch.setattr(record_cache, "daily_history", fake)
    out = await calibrate.region_calibration(
        parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 500}),
        [{"kind": "stage", "observed_on": "2027-01-10", "crop": "Spinach", "stage": "harvest",
          "gdd_target": 900, "set_out": "2026-10-01"}],
        50.0, today=date(2027, 1, 20),
    )
    measured = _find(out, "observed_gdd")
    assert measured and measured[0] >= 990, f"measured {measured} — counted from Jan 1?"


async def test_sunlight_reports_are_counted_here_and_judged_by_the_sunlight_tool(monkeypatch):
    """A block whose only reports are about light still answers, with a pointer."""
    async def fake(lats, lons, start, end):
        s, e = date.fromisoformat(start), date.fromisoformat(end)
        days = [s + timedelta(days=i) for i in range((e - s).days + 1)]
        return [{"elevation": 100.0, "daily": {
            "time": [d.isoformat() for d in days],
            "temperature_2m_max": [70.0] * len(days), "temperature_2m_min": [50.0] * len(days),
        }}]

    monkeypatch.setattr(record_cache, "daily_history", fake)
    out = await calibrate.region_calibration(
        parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 500}),
        [{"kind": "sunlight", "observed_on": "2026-06-14", "from": "09:00", "to": "14:00",
          "light": "sun", "lat": 44.48, "lon": -73.21}],
        50.0, today=date(2026, 7, 1),
    )
    assert out["success"] and out["observations_used"] == 0 and out["skipped"] == []
    assert out["sunlight_reports"]["count"] == 1 and "goodearth_sunlight" in out["sunlight_reports"]["read_by"]
