"""The MCP Registry entry says what the server is, and stays in step with it.

``server.json`` is published to the official MCP Registry by hand, and a
publish is refused for a version already published. So the entry's version
is the service's own, and its endpoint is the one every page names.
"""

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENTRY = json.loads((ROOT / "server.json").read_text())
ENDPOINT = "https://goodearth-mcp.fastmcp.app/mcp"


def test_it_is_under_the_domain_verified_namespace():
    assert ENTRY["name"] == "com.tollbooth-dpyc/goodearth-mcp"


def test_its_version_is_the_services_own():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    assert ENTRY["version"] == project["version"]


def test_it_points_at_the_endpoint_the_site_names():
    assert ENTRY["remotes"] == [{"type": "streamable-http", "url": ENDPOINT}]
    llms = (ROOT / "frontend" / "public" / "llms.txt").read_text()
    assert ENDPOINT in llms


def test_its_description_fits_the_registrys_limit():
    assert 0 < len(ENTRY["description"]) <= 100
