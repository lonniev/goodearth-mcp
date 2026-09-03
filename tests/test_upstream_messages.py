"""A failed feed must say which failure it was.

On 2026-09-03 Open-Meteo's archive endpoint stopped answering — connections
accepted nothing for 45s — and the Almanac showed the grower:

    could not read this season's record:
    https://archive-api.open-meteo.com/v1/archive unreachable:

A sentence ending in a colon. Every httpx transport error stringifies to the
empty string, so a timeout, a refused connection and a DNS failure all rendered
identically as nothing at all — which cannot distinguish "the service is down"
from "we have no network" from "the address is wrong". Three different days'
work, one indistinguishable message.
"""

from __future__ import annotations

import httpx
import pytest

from goodearth_mcp.sources import _TIMEOUT, _why


@pytest.mark.parametrize("exc", [
    httpx.ConnectTimeout(""),
    httpx.ReadTimeout(""),
    httpx.WriteTimeout(""),
    httpx.PoolTimeout(""),
    httpx.ConnectError(""),
    httpx.ReadError(""),
])
def test_no_failure_is_ever_wordless(exc):
    """The bug itself: a message that stops at the colon."""
    said = _why(exc)
    assert said.strip(), f"{type(exc).__name__} produced no explanation"
    assert len(said) > 8, f"{type(exc).__name__} said only {said!r}"


def test_a_timeout_says_how_long_it_waited():
    said = _why(httpx.ConnectTimeout(""))
    assert f"{_TIMEOUT:g}s" in said, said


def test_the_three_are_told_apart():
    """The distinction that decides what to do next."""
    down = _why(httpx.ConnectTimeout(""))          # service not answering
    silent = _why(httpx.ReadTimeout(""))           # answered, then nothing
    refused = _why(httpx.ConnectError(""))         # refused or no such host
    assert len({down, silent, refused}) == 3, (down, silent, refused)


def test_a_real_message_is_preferred_over_a_class_name():
    """When httpx does say something useful, say that instead."""
    assert _why(httpx.ConnectError("nodename nor servname provided")) == (
        "nodename nor servname provided"
    )
