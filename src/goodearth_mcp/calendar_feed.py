"""The calendar feed — a farm's season, where the farm already looks.

A grower does not live in this app. They live in whatever calendar tells them
about the school run and the market stall, and a bloom date that is not in
there is a bloom date they will miss. So Good Earth publishes its own answers
as a subscribable calendar rather than asking anyone to come and check.

Two component types, because the ask has two halves and calendar clients treat
them differently:

* **Phenology events → all-day VEVENT.** A dahlia does not bloom at 14:00.
* **To-dos → VTODO**, which Apple Reminders, Google Tasks and Thunderbird
  surface as tasks rather than as another appointment on an already full day.

Recomputing and serving are separate acts, and the operator prices each of
them independently in Pricing Studio. Recomputing runs the weather feeds and
rebuilds the calendar; serving returns what was last built. Which of them
carries a fare, and how much, is the operator's dial — this module only keeps
them separable so that dial exists.
"""

from __future__ import annotations

import secrets
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import crops, gdd, ical, pests, sources, wildlife
from goodearth_mcp.frost import first_fall_frost, summarize_frost_dates
from goodearth_mcp.region import Region

MAX_TODOS = 200
RECORD_SPAN_YEARS = 10


class CalendarError(ValueError):
    """The feed cannot be built as asked."""


def new_token() -> str:
    """An unguessable feed id.

    The URL is the only credential a calendar client can carry — there is no
    place to put a proof in an ICS subscription — so it must be long enough
    that guessing one is not a strategy. 32 hex characters is 128 bits.
    """
    return secrets.token_hex(16)


def validate_todos(raw: Any) -> list[dict[str, Any]]:
    """Check the to-do list. These come from a phone in a field."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise CalendarError("todos must be a list")
    if len(raw) > MAX_TODOS:
        raise CalendarError(f"{len(raw)} to-dos is more than one feed should carry (limit {MAX_TODOS})")

    out: list[dict[str, Any]] = []
    for t in raw:
        if not isinstance(t, dict):
            raise CalendarError("each to-do must be an object with a title")
        title = str(t.get("title") or t.get("summary") or "").strip()
        if not title:
            raise CalendarError("a to-do needs a title")
        due = ical.as_date(t.get("due"))
        if t.get("due") and due is None:
            raise CalendarError(f"{title}: due must be YYYY-MM-DD")
        out.append({
            "title": title[:200],
            "due": due,
            "note": str(t.get("note") or "")[:500],
            "done": bool(t.get("done")),
            # A task the grower did not mark "reminder only" is something they
            # mean to be doing at an hour, so it publishes as a timed entry.
            # Defaulting to True keeps every task that predates these fields a
            # reminder, which is what it already was.
            "reminder_only": bool(t.get("reminder_only", True)),
            "starts_at": str(t.get("starts_at") or "")[:5],
            "ends_at": str(t.get("ends_at") or "")[:5],
            "id": str(t.get("id") or title)[:80],
        })
    return out


async def build_feed(
    region: Region,
    region_name: str,
    token: str,
    *,
    plantings: Any = None,
    pest_models: Any = None,
    wildlife_events: Any = None,
    todos: Any = None,
    base_temp_f: float = 50.0,
    today: date | None = None,
) -> dict[str, Any]:
    """Compute every dated thing this block knows about, as one calendar."""
    today = today or datetime.now(UTC).date()
    stamp = datetime.now(UTC)
    start = gdd.season_start(today)

    parsed_todos = validate_todos(todos)
    parsed_plantings = [crops.validate_planting(p) for p in (plantings or [])]
    parsed_pests = [pests.validate_model(m) for m in (pest_models or [])]
    parsed_wild = [wildlife.validate_event(e) for e in (wildlife_events or [])]

    dates: list[str] = []
    curves: dict[float, list[float]] = {}
    frost_summary: dict[str, Any] | None = None

    # The season and the frost record are read unconditionally. Frost dates
    # belong on any farm calendar, so even a feed of nothing but to-dos is
    # worth the fetch — and a feed that quietly omitted them depending on what
    # else was in it would be a surprising calendar.
    try:
        season, record = (
            await sources.fetch_daily_history(
                [region.centroid.lat], [region.centroid.lon],
                start.isoformat(), today.isoformat(),
            ),
            await sources.fetch_daily_history(
                [region.centroid.lat], [region.centroid.lon],
                date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat(),
                date(today.year - 1, 12, 31).isoformat(),
            ),
        )
    except sources.UpstreamError as exc:
        raise CalendarError(f"could not read this ground's season: {exc}") from exc

    if season:
        try:
            dates, tmax, tmin = sources.daily_series(season[0])
            bases = {base_temp_f}
            bases |= {p["base_temp_f"] or base_temp_f for p in parsed_plantings}
            bases |= {m["base_temp_f"] for m in parsed_pests}
            bases |= {e["base_temp_f"] for e in parsed_wild if e["driver"] == "heat"}
            curves = {b: gdd.accumulate(tmax, tmin, b) for b in sorted(bases)}
        except sources.UpstreamError:
            pass

    if record:
        try:
            f_dates, _fx, f_tmin = sources.daily_series(record[0])
            years = list(range(today.year - RECORD_SPAN_YEARS, today.year))
            got = [d for y in years if (d := first_fall_frost(f_dates, f_tmin, y))]
            frost_summary = summarize_frost_dates(got, today.year)
        except (sources.UpstreamError, IndexError, ValueError):
            frost_summary = None

    entries: list[list[str]] = []
    counted = {"crop": 0, "pest": 0, "wildlife": 0, "frost": 0, "todo": 0}

    # The dataset. A calendar is one rendering of these; a caller wanting a
    # table, a Gantt or a push notification wants the same rows, so they are
    # returned in their own right rather than only as iCalendar text.
    structured: list[dict[str, Any]] = []

    def record(kind: str, key: str, title: str, day: date, detail: str, emoji: str = "") -> None:
        structured.append({
            "kind": kind,
            "key": key,
            "title": title,
            "date": day.isoformat(),
            "emoji": emoji or None,
            "detail": detail,
            "uid": ical.uid_for(token, kind, key),
        })

    def when(curve: list[float], target: float) -> date | None:
        """The date a cumulative curve reaches a target, projected if needed."""
        for d, g in zip(dates, curve, strict=False):
            if g >= target:
                return ical.as_date(d)
        rate = crops.recent_rate(curve)
        if rate <= 0 or not curve:
            return None
        days = (target - curve[-1]) / rate
        return today + __import__("datetime").timedelta(days=round(days)) if 0 < days <= 200 else None

    # ── Crop targets ─────────────────────────────────────────────────────
    for p in parsed_plantings:
        curve = curves.get(p["base_temp_f"] or base_temp_f)
        if not curve:
            continue
        acc = crops.accumulated_since(dates, curve, p["set_out"])
        if acc is None:
            continue
        offset = curve[-1] - acc[0]
        d = when(curve, offset + p["gdd_target"])
        if not d:
            continue
        record("crop", f"{p['crop']}-{p['set_out']}", f"{p['crop']} — target", d,
               f"{p['gdd_target']:g} GDD from set-out {p['set_out'].isoformat()}", "🌱")
        entries.append(ical.vevent(
            ical.uid_for(token, "crop", f"{p['crop']}-{p['set_out']}"),
            f"🌱 {p['crop']} — target",
            d,
            description=(
                f"{p['gdd_target']:g} GDD from set-out {p['set_out'].isoformat()}, "
                f"base {p['base_temp_f'] or base_temp_f:g}°F, on {region_name}. "
                "Projected past the forecast at the recent rate — not a forecast."
            ),
            stamp=stamp, categories="Good Earth,Crops",
        ))
        counted["crop"] += 1

    # ── Pest stages ──────────────────────────────────────────────────────
    for m in parsed_pests:
        curve = curves.get(m["base_temp_f"])
        if not curve:
            continue
        base_acc = 0.0
        if m["biofix"]:
            got = pests.accumulated_from_biofix(dates, curve, m["biofix"])
            if got is None:
                continue
            base_acc = curve[-1] - got[0]
        for st in m["stages"]:
            d = when(curve, base_acc + st["gdd"])
            if not d:
                continue
            record("pest", f"{m['pest']}-{st['stage']}",
                   f"{m['pest']} — {st['stage']}", d,
                   f"{st['gdd']:g} GDD, base {m['base_temp_f']:g}°F", "🐛")
            entries.append(ical.vevent(
                ical.uid_for(token, "pest", f"{m['pest']}-{st['stage']}"),
                f"🐛 {m['pest']} — {st['stage']}",
                d,
                description=(
                    f"{st['gdd']:g} GDD, base {m['base_temp_f']:g}°F, on {region_name}. "
                    "Your own threshold — confirm against a local extension bulletin. "
                    "Good Earth does not recommend treatments."
                ),
                stamp=stamp, categories="Good Earth,Pests",
            ))
            counted["pest"] += 1

    # ── Wildlife and husbandry ───────────────────────────────────────────
    for e in parsed_wild:
        d: date | None = None
        detail = ""
        if e["driver"] == "heat":
            curve = curves.get(e["base_temp_f"])
            if curve:
                d = when(curve, e["gdd"])
                detail = f"{e['gdd']:g} GDD, base {e['base_temp_f']:g}°F"
        elif e["driver"] == "interval":
            r = wildlife.interval_event(e, today)
            d = ical.as_date(r.get("reached_on") or r.get("projected_date"))
            detail = r["threshold"]
        elif e["driver"] == "calendar":
            r = wildlife.calendar_event(e, today)
            d = ical.as_date(r.get("reached_on") or r.get("projected_date"))
            detail = r["threshold"]
        else:  # daylight
            from goodearth_mcp.almanac import next_daylight_crossing
            iso = next_daylight_crossing(
                region.centroid.lat, today, e["daylight_hours"], e["rising"]
            )
            d = ical.as_date(iso)
            detail = f"{e['daylight_hours']:g} h and {'lengthening' if e['rising'] else 'shortening'}"
        if not d:
            continue
        record("wildlife", f"{e['species']}-{e['event']}",
               f"{e['species']} — {e['event']}", d, detail, e["emoji"] or "🦋")
        entries.append(ical.vevent(
            ical.uid_for(token, "wild", f"{e['species']}-{e['event']}"),
            f"{e['emoji'] or '🦋'} {e['species']} — {e['event']}",
            d,
            description=f"{detail}, on {region_name}. Your own threshold.",
            stamp=stamp, categories="Good Earth,Wildlife",
        ))
        counted["wildlife"] += 1

    # ── Frost ────────────────────────────────────────────────────────────
    if frost_summary:
        for key, label, emoji in (
            ("earliest", "earliest first frost on record", "❄️"),
            ("median", "median first frost", "❄️"),
        ):
            d = ical.as_date(frost_summary[key])
            if not d:
                continue
            record("frost", key, f"{region_name} — {label}", d,
                   f"from {frost_summary['years_on_record']} seasons", emoji)
            entries.append(ical.vevent(
                ical.uid_for(token, "frost", key),
                f"{emoji} {region_name} — {label}",
                d,
                description=(
                    f"From {frost_summary['years_on_record']} seasons at the region centroid. "
                    "Low ground frosts before the bench — see the block's spread."
                ),
                stamp=stamp, categories="Good Earth,Frost",
            ))
            counted["frost"] += 1

    # ── To-dos ───────────────────────────────────────────────────────────
    for t in parsed_todos:
        if t["due"]:
            record("todo", t["id"], t["title"], t["due"], t["note"] or "", "✅")
        if not t["reminder_only"] and t["due"] and t["starts_at"] and t["ends_at"]:
            entries.append(ical.timed_event(
                ical.uid_for(token, "todo", t["id"]),
                t["title"], t["due"], t["starts_at"], t["ends_at"],
                description=t["note"], stamp=stamp, categories="Good Earth,To-Do",
            ))
        else:
            entries.append(ical.vtodo(
                ical.uid_for(token, "todo", t["id"]),
                t["title"],
                t["due"],
                description=t["note"],
                stamp=stamp,
                completed=t["done"],
                categories="Good Earth,To-Do",
            ))
        counted["todo"] += 1

    ics = ical.calendar(
        f"Good Earth — {region_name}",
        entries,
        description=(
            f"Season events and tasks for {region_name}. "
            f"Computed {today.isoformat()}. Refreshing this calendar in your "
            "client re-reads what Good Earth last computed; recomputing it "
            "against new weather is done from the app."
        ),
    )

    return {
        "ics": ics,
        "events": structured,
        "counts": counted,
        "total": sum(counted.values()),
        "computed_on": today.isoformat(),
    }
