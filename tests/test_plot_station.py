"""A plot's one FieldData station, and what it reports."""

from __future__ import annotations

import inspect
import json

import pytest

from goodearth_mcp import block_store, fielddata_client, server

NPUB = "npub1patron"


@pytest.fixture
def items(monkeypatch):
    rows: dict[str, dict] = {}

    async def resolve(npub, block):
        if block != "north":
            raise block_store.BlockError("No block matches.")
        return {"block_id": f"{npub}-north", "name": "North"}

    async def list_items(npub, block_id, kind, **_):
        assert kind == "station"
        return {"items": [r for r in rows.values() if r["_block"] == block_id]}

    async def save_items(npub, block_id, kind, items):
        assert kind == "station"
        for item in items:
            rows[item["item_id"]] = {**item, "_block": block_id}
        return [i["item_id"] for i in items]

    async def retire_items(npub, ids):
        for i in ids:
            rows.pop(i, None)
        return len(ids)

    monkeypatch.setattr(block_store, "resolve", resolve)
    monkeypatch.setattr(block_store, "list_items", list_items)
    monkeypatch.setattr(block_store, "save_items", save_items)
    monkeypatch.setattr(block_store, "retire_items", retire_items)
    return rows


station = inspect.unwrap(server.plot_station)
conditions = inspect.unwrap(server.plot_conditions)


def test_station_is_a_kind_a_plot_can_hold():
    assert "station" in block_store.KINDS
    assert "station" not in block_store.SEASON_KINDS


async def test_a_plot_with_no_station_says_so_for_free(items):
    assert (await station("north", npub=NPUB))["station"] is None


async def test_set_replace_and_clear(items):
    await station("north", "s1", "TheDellie", npub=NPUB)
    assert (await station("north", npub=NPUB))["station"] == {"station_id": "s1", "name": "TheDellie"}
    await station("north", "s2", "Westport", npub=NPUB)
    assert len(items) == 1
    assert (await station("north", npub=NPUB))["station"]["station_id"] == "s2"
    await station("north", "", npub=NPUB)
    assert not items


async def test_conditions_with_no_station_raise_so_the_fare_is_refunded(items):
    with pytest.raises(ValueError, match="North has no station"):
        await conditions("north", npub=NPUB)


async def test_conditions_read_the_saved_station_and_name_it(items, monkeypatch):
    await station("north", "s1", "TheDellie", npub=NPUB)
    asked = []

    async def call(npub, tool, args):
        asked.append((npub, tool, args))
        return {"success": True, "readings": [
            {"sensor_kind": "air_temperature", "quantity": 10.9, "unit": "°C", "observed_at": "2026-10-30T14:00:00Z"},
            {"sensor_kind": "pressure", "quantity": 1016.0, "unit": "hPa", "observed_at": "2026-10-30T14:05:00Z"},
        ]}

    monkeypatch.setattr(server.fielddata, "call", call)
    out = await conditions("north", npub=NPUB)
    assert asked == [(NPUB, "current", {"station": "s1"})]
    assert out["station"]["name"] == "TheDellie"
    assert out["observed_at"] == "2026-10-30T14:05:00Z"
    assert len(out["readings"]) == 2


@pytest.mark.parametrize("failure", [
    fielddata_client.FieldDataNotConnected(fielddata_client.CONNECT_FIRST),
    fielddata_client.FieldDataError("Insufficient credit balance"),
])
async def test_a_fielddata_failure_raises_a_value_error_so_the_fare_is_refunded(items, monkeypatch, failure):
    await station("north", "s1", "TheDellie", npub=NPUB)

    async def call(npub, tool, args):
        raise failure

    monkeypatch.setattr(server.fielddata, "call", call)
    with pytest.raises(ValueError):
        await conditions("north", npub=NPUB)


async def test_one_patrons_station_is_not_anothers(items):
    await station("north", "s1", "TheDellie", npub=NPUB)
    assert (await station("north", npub="npub1other"))["station"] is None


async def test_stations_show_id_name_and_place(monkeypatch):
    async def call(npub, tool, args=None):
        return {"stations": [{"station_id": "s1", "name": "TheDellie", "latitude": 44.1, "longitude": -73.2, "sensors": []}]}

    monkeypatch.setattr(server.fielddata, "call", call)
    out = await inspect.unwrap(server.fielddata_stations)(npub=NPUB)
    assert out["stations"] == [{"station_id": "s1", "name": "TheDellie", "latitude": 44.1, "longitude": -73.2}]
    assert "nearby" not in out


async def test_a_plot_also_gets_where_it_is_and_the_stations_near_it(monkeypatch):
    asked = []

    async def call(npub, tool, args=None):
        asked.append((tool, args))
        if tool == "list_stations":
            return {"stations": []}
        return {"stations": [{"station_id": "p1", "name": "Hill", "latitude": 44.2, "longitude": -73.1,
                              "distance_km": 3.4, "choice": "ambient:1:2:p1", "readings": []}]}

    async def block_region(npub, block):
        centre = type("C", (), {"lat": 44.0, "lon": -73.0})
        return type("R", (), {"centroid": centre}), {"name": "North"}

    monkeypatch.setattr(server.fielddata, "call", call)
    monkeypatch.setattr(server, "_block_region", block_region)
    out = await inspect.unwrap(server.fielddata_stations)("north", npub=NPUB)
    assert out["place"] == {"name": "North", "latitude": 44.0, "longitude": -73.0}
    assert out["nearby"] == [{"station_id": "p1", "name": "Hill", "latitude": 44.2, "longitude": -73.1,
                              "distance_km": 3.4, "choice": "ambient:1:2:p1"}]
    assert asked[1] == ("nearby_stations", {"latitude": 44.0, "longitude": -73.0, "radius_km": 50.0})


async def test_a_choice_joins_the_patrons_fielddata_stations_once(items, monkeypatch):
    saved = ["ambient:1:2:old"]
    written = []

    async def call(npub, tool, args=None):
        if tool == "get_my_properties":
            return {"properties": [{"name": "other", "value": 1}, {"name": "chosen_stations", "value": list(saved)}]}
        written.append(args)
        saved[:] = json.loads(args["value"])
        return {"success": True}

    monkeypatch.setattr(server.fielddata, "call", call)
    await station("north", "p1", "Hill", choice="ambient:3:-4:p1", npub=NPUB)
    await station("north", "p1", "Hill", choice="ambient:3:-4:p1", npub=NPUB)
    assert saved == ["ambient:1:2:old", "ambient:3:-4:p1"]
    assert len(written) == 1
    assert (await station("north", npub=NPUB))["station"]["station_id"] == "p1"


async def test_a_malformed_choice_changes_nothing(items, monkeypatch):
    await station("north", "s1", "TheDellie", npub=NPUB)

    async def call(npub, tool, args=None):
        raise AssertionError("FieldData was asked")

    monkeypatch.setattr(server.fielddata, "call", call)
    with pytest.raises(ValueError, match="not a station choice"):
        await station("north", "p1", "Hill", choice='x","y', npub=NPUB)
    assert (await station("north", npub=NPUB))["station"]["station_id"] == "s1"


async def test_a_failed_fielddata_write_keeps_the_plots_station(items, monkeypatch):
    await station("north", "s1", "TheDellie", npub=NPUB)

    async def call(npub, tool, args=None):
        raise fielddata_client.FieldDataError("FieldData refused that request.")

    monkeypatch.setattr(server.fielddata, "call", call)
    with pytest.raises(ValueError):
        await station("north", "p1", "Hill", choice="ambient:3:-4:p1", npub=NPUB)
    assert (await station("north", npub=NPUB))["station"]["station_id"] == "s1"


@pytest.mark.parametrize("tool", [server.fielddata_connect, server.fielddata_stations])
async def test_no_npub_is_refused(tool):
    with pytest.raises(ValueError, match="npub is required"):
        await inspect.unwrap(tool)(npub="")


async def test_keys_are_kept_under_their_own_service(monkeypatch):
    seen = {}

    async def store(npub, tokens, *, service):
        seen.update(service=service, tokens=tokens)
        return True

    monkeypatch.setattr(server.runtime, "store_patron_session", store)
    assert await server._store_fielddata_connection(NPUB, {"access_token": "x"})
    assert seen["service"] == "fielddata-connection"


def test_station_wind_uses_the_forecast_cards_words():
    wind = server._station_wind([
        {"sensor_kind": "wind_speed", "quantity": 2.2},
        {"sensor_kind": "wind_direction", "quantity": 45},
    ])
    assert wind["from"] == "NE" and wind["emoji"] == "🍃" and wind["strength"] == "light"
    assert server._station_wind([{"sensor_kind": "air_temperature", "quantity": 9}]) is None
