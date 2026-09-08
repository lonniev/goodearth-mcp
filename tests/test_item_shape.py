"""The nested wildlife shape is refused at the write, not diagnosed at the feed.

An agent saved a Domestic Chicken as ``{"species": ..., "events": [...]}``. The
call reported success, the row landed, and the feed then said the creature
"names no event — nothing to date". Every component was right; the write was
wrong. This is where it is now caught.
"""

from __future__ import annotations

import pytest

from goodearth_mcp import block_store as bs
from goodearth_mcp import wildlife

NESTED = {
    "species": "Domestic chicken",
    "events": [
        {"event": "laying on eggs", "driver": "calendar", "typical_on": "09-05"},
        {"event": "eggs hatch", "driver": "interval", "from": "2026-09-05", "days": 21},
    ],
}

FLAT = {
    "species": "Domestic chicken", "event": "eggs hatch",
    "driver": "interval", "from": "2026-09-05", "days": 21,
}


def test_a_nested_events_list_is_refused():
    with pytest.raises(bs.BlockError) as exc:
        bs.check_item_shape("wildlife", NESTED)
    said = str(exc.value)
    # The refusal has to teach the shape. Whatever wrote this will write again,
    # and "invalid item" would send it round the same loop.
    assert "top level" in said
    assert "one item per event" in said
    assert '"driver"' in said


def test_a_lone_nested_event_object_is_refused_the_same_way():
    with pytest.raises(bs.BlockError):
        bs.check_item_shape("wildlife", {"species": "Ewe", "events": FLAT})


def test_the_flat_shape_is_what_the_readers_actually_want():
    # The two halves agree: what the store accepts is what `validate_event`
    # can date. Asserting only the store's acceptance would prove nothing.
    bs.check_item_shape("wildlife", FLAT)
    out = wildlife.validate_event(FLAT)
    assert out["driver"] == "interval"
    assert out["days"] == 21


def test_a_roster_row_still_passes():
    """A creature named and not yet dated is a real row, and carries no event."""
    named = {"species": "Barred owl", "role": "friend"}
    bs.check_item_shape("wildlife", named)
    assert wildlife.validate_event(named)["roster_only"] is True


@pytest.mark.parametrize("kind", ["planting", "pest", "observation"])
def test_other_kinds_are_left_alone(kind):
    """Narrow on purpose. `events` means something specific to wildlife, and a
    blanket refusal would reject a field another kind may legitimately grow."""
    bs.check_item_shape(kind, {"crop": "Winter wheat", "events": ["anything"]})
