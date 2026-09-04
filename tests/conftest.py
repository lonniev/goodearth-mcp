"""No test reaches the network.

A test that calls a third party is not a test of this code — it is a test of
that party's uptime, and it reports their bad afternoon as our bug. Worse, it
does so intermittently: `test_row_identity` passed on a laptop and failed in CI
on a connect timeout to Open-Meteo, which is the worst shape a test can take —
green where it is written, red where it is trusted.

**Blocked at the socket, not at the transport.** The first attempt patched
`httpx`'s transport, which is precisely where `respx` does its own patching, so
the guard and the mocking library fought over the same attribute and eighteen
properly-mocked tests failed. A socket is lower than either: `respx` answers a
request without ever opening one, so it never notices this, while a genuine
outbound call trips it immediately.

When a test trips this, the fix is to stub what it was asking for — see
`test_row_identity.py` for stubbing the source, `test_sources.py` for mocking
the transport with respx. If a live check is ever genuinely wanted it belongs
in its own command outside `pytest tests/`, so that an outage elsewhere can
never fail a build about this code.
"""

from __future__ import annotations

import socket

import pytest


class NetworkReached(RuntimeError):
    """A test tried to open a real connection."""


_real_connect = socket.socket.connect
_real_create = socket.create_connection


def _explain(address: object) -> NetworkReached:
    return NetworkReached(
        f"a test tried to open a connection to {address}.\n"
        "Tests must not depend on a third party being up. Stub the source "
        "(tests/test_row_identity.py) or mock the transport with respx "
        "(tests/test_sources.py)."
    )


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def refuse(self, address, *a, **kw):
        # Unix sockets and loopback stay open: they are this machine talking to
        # itself, which is not a dependency on anybody's uptime.
        if isinstance(address, tuple) and str(address[0]) not in ("127.0.0.1", "::1", "localhost"):
            raise _explain(address)
        return _real_connect(self, address, *a, **kw)

    def refuse_create(address, *a, **kw):
        if isinstance(address, tuple) and str(address[0]) not in ("127.0.0.1", "::1", "localhost"):
            raise _explain(address)
        return _real_create(address, *a, **kw)

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse_create)
    yield
