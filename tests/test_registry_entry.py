"""The MCP Registry entry says what the server is, and stays in step with it.

``server.json`` is published to the official MCP Registry by
``publish-mcp-registry.yml`` on every ``v*`` tag, with GitHub OIDC — which
grants only ``io.github.lonniev/*``, the namespace the rest of the fleet is
listed under. A publish is refused for a version already published, so the
committed version is the service's own, and the endpoint is the one every
page names.
"""

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENTRY = json.loads((ROOT / "server.json").read_text())
ENDPOINT = "https://goodearth-mcp.fastmcp.app/mcp"


def test_it_is_under_the_namespace_the_publish_workflow_can_log_in_to():
    assert ENTRY["name"] == "io.github.lonniev/goodearth-mcp"
    workflow = (ROOT / ".github" / "workflows" / "publish-mcp-registry.yml").read_text()
    assert "login github-oidc" in workflow


def test_its_version_is_the_services_own():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    assert ENTRY["version"] == project["version"]


def test_it_points_at_the_endpoint_the_site_names():
    assert ENTRY["remotes"] == [{"type": "streamable-http", "url": ENDPOINT}]
    llms = (ROOT / "frontend" / "public" / "llms.txt").read_text()
    assert ENDPOINT in llms


def test_its_description_fits_the_registrys_limit():
    assert 0 < len(ENTRY["description"]) <= 100
