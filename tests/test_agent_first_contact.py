"""A grower's agent that connects cold finds the grower's path first.

The server's ``instructions`` are the first thing an MCP client reads. They
used to open onto the OPERATOR's setup — Authority registration and BTCPay
secrets — so an agent asked to help a gardener was handed steps no gardener
takes. An AI assistant reviewing the site also reported it could not tell how
to use Good Earth at all.
"""

from goodearth_mcp import server

TEXT = server.mcp.instructions or ""


def test_the_growers_path_comes_before_the_operators():
    grower = TEXT.find("First connection, for a grower's agent")
    operator = TEXT.find("Operator onboarding")
    assert grower != -1, "the instructions no longer say how a grower's agent starts"
    assert operator == -1 or grower < operator


def test_it_names_the_proof_steps_an_agent_must_take():
    for tool in ("goodearth_request_npub_proof", "goodearth_receive_npub_proof",
                 "goodearth_check_balance", "goodearth_purchase_credits",
                 "goodearth_block_list"):
        assert tool in TEXT, f"{tool} is missing from the first-connection steps"


def test_it_asks_for_the_npub_and_never_the_secret_key():
    assert "npub" in TEXT
    assert "Never ask for an nsec" in TEXT


def test_it_points_at_the_web_app_the_same_tools_drive():
    assert "https://goodearth.tollbooth-dpyc.com" in TEXT
