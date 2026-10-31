"""Good Earth as a client of FieldData: the published connect steps, and how a call can fail."""

from __future__ import annotations

import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from goodearth_mcp import fielddata_client as fc

NPUB = "npub1patron"
FRESH = {"client_id": "c1", "access_token": "ACCESS-SECRET", "refresh_token": "REFRESH-SECRET"}


class Vault:
    def __init__(self, stored=None):
        self.stored = stored

    async def load(self, npub):
        return self.stored

    async def store(self, npub, tokens):
        self.stored = tokens
        return True


def connected(expires_in=3600):
    return Vault({**FRESH, "expires_at": str(time.time() + expires_in)})


def tool_answers(monkeypatch, *answers):
    seen = []
    queue = list(answers)

    async def post(access, tool, args):
        seen.append((access, tool, args))
        answer = queue.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(fc, "_post_tool", post)
    return seen


def token_route(access="NEW-ACCESS", refresh="NEW-REFRESH"):
    return respx.post(f"{fc.BASE_URL}/token").mock(return_value=httpx.Response(
        200, json={"access_token": access, "refresh_token": refresh, "expires_in": 3600},
    ))


@respx.mock
async def test_connect_registers_authorizes_with_pkce_stores_tokens_and_sends_the_dm(monkeypatch):
    vault = Vault()
    respx.post(f"{fc.BASE_URL}/register").mock(return_value=httpx.Response(201, json={"client_id": "c9"}))

    def authorized(request):
        q = parse_qs(urlparse(str(request.url)).query)
        assert q["code_challenge_method"] == ["S256"] and q["resource"] == [fc.MCP_URL]
        assert request.headers["accept"] == "application/json"
        return httpx.Response(200, json={"redirect_uri": f"{fc.REDIRECT_URI}?code=C&state={q['state'][0]}"})

    respx.get(f"{fc.BASE_URL}/authorize").mock(side_effect=authorized)
    token = token_route()
    seen = tool_answers(monkeypatch, {"nonce": "pale-arrow-74", "rendezvous_relay": "wss://r"})

    out = await fc.FieldData(vault.load, vault.store).connect(NPUB)

    assert out == {"phrase": "pale-arrow-74", "relay": "wss://r"}
    assert vault.stored["client_id"] == "c9" and vault.stored["access_token"] == "NEW-ACCESS"
    form = parse_qs(token.calls[0].request.content.decode())
    assert form["grant_type"] == ["authorization_code"] and form["code_verifier"]
    assert seen[0][1] == "request_npub_proof" and seen[0][2]["patron_npub"] == NPUB


@respx.mock
async def test_a_reply_with_the_wrong_state_is_refused():
    respx.post(f"{fc.BASE_URL}/register").mock(return_value=httpx.Response(201, json={"client_id": "c9"}))
    respx.get(f"{fc.BASE_URL}/authorize").mock(return_value=httpx.Response(
        200, json={"redirect_uri": f"{fc.REDIRECT_URI}?code=C&state=forged"},
    ))
    vault = Vault()
    with pytest.raises(fc.FieldDataError, match="did not match"):
        await fc.FieldData(vault.load, vault.store).connect(NPUB)
    assert vault.stored is None


async def test_connecting_again_keeps_the_holder(monkeypatch):
    vault = connected()
    seen = tool_answers(monkeypatch, {"nonce": "x"})
    await fc.FieldData(vault.load, vault.store).connect(NPUB)
    assert seen[0][0] == "ACCESS-SECRET"


async def test_a_call_names_the_npub_and_returns_the_answer(monkeypatch):
    vault = connected()
    seen = tool_answers(monkeypatch, {"success": True, "readings": []})
    out = await fc.FieldData(vault.load, vault.store).call(NPUB, "current", {"station": "s1"})
    assert out["readings"] == []
    assert seen == [("ACCESS-SECRET", "current", {"npub": NPUB, "station": "s1"})]


@respx.mock
async def test_an_expired_access_token_refreshes_and_the_new_pair_is_kept(monkeypatch):
    vault = connected(expires_in=-10)
    token = token_route()
    seen = tool_answers(monkeypatch, {"success": True})
    await fc.FieldData(vault.load, vault.store).call(NPUB, "current")
    assert seen[0][0] == "NEW-ACCESS"
    assert vault.stored["refresh_token"] == "NEW-REFRESH"
    assert "refresh_token" in token.calls[0].request.content.decode()


@respx.mock
async def test_a_refused_refresh_means_connect_again(monkeypatch):
    vault = connected(expires_in=-10)
    respx.post(f"{fc.BASE_URL}/token").mock(return_value=httpx.Response(400, json={"error": "invalid_grant"}))
    with pytest.raises(fc.FieldDataNotConnected, match="Connect your FieldData"):
        await fc.FieldData(vault.load, vault.store).call(NPUB, "current")


async def test_no_connection_yet_says_connect():
    vault = Vault()
    with pytest.raises(fc.FieldDataNotConnected):
        await fc.FieldData(vault.load, vault.store).call(NPUB, "current")


async def test_proof_required_says_connect(monkeypatch):
    vault = connected()
    tool_answers(monkeypatch, {"success": False, "error_code": "proof_required", "error": "no"})
    with pytest.raises(fc.FieldDataNotConnected):
        await fc.FieldData(vault.load, vault.store).call(NPUB, "current")


async def test_fielddatas_own_refusal_passes_through(monkeypatch):
    vault = connected()
    tool_answers(monkeypatch, {"success": False, "error": "Insufficient credit balance"})
    with pytest.raises(fc.FieldDataError, match="Insufficient"):
        await fc.FieldData(vault.load, vault.store).call(NPUB, "current")


async def test_a_transport_failure_carries_no_token(monkeypatch):
    vault = connected()
    tool_answers(monkeypatch, RuntimeError("Bearer ACCESS-SECRET at https://x"))

    async def direct(access, tool, args):
        raise RuntimeError(f"Bearer {access}")

    monkeypatch.setattr(fc, "_post_tool", direct)
    with pytest.raises(fc.FieldDataError) as caught:
        await fc.FieldData(vault.load, vault.store).call(NPUB, "current")
    assert "SECRET" not in str(caught.value)
    assert caught.value.__cause__ is None


def test_tokens_stay_out_of_repr():
    tokens = fc.Tokens.from_stored({**FRESH, "expires_at": "1"})
    assert "SECRET" not in repr(tokens)


@pytest.mark.parametrize("stored", [None, {}, {"client_id": "c"}, {**FRESH, "access_token": ""}])
def test_a_partial_store_is_no_connection(stored):
    assert fc.Tokens.from_stored(stored) is None
