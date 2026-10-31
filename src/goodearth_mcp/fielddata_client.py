"""Good Earth as an ordinary client of the FieldData MCP.

Neither service imports the other's code; the contract is FieldData's published
interface. A client with no key connects as an OAuth *holder* (register,
authorize with PKCE, token), a patron proves their npub into it by replying to a
Nostr DM, and calls then name only the npub. Each patron has their own holder.

The tokens are the patron's, kept through the two callables given here, which the
server points at its encrypted vault. No token reaches a log, an error or a reply.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import secrets
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://fielddata-mcp.fastmcp.app"
MCP_URL = f"{BASE_URL}/mcp"
TOOL_PREFIX = "fielddata_"
# Registered and named, never visited: the code comes back by fetch.
REDIRECT_URI = "https://goodearth.tollbooth-dpyc.com/"
_TIMEOUT = 30.0
_EARLY_SECONDS = 60

CONNECT_FIRST = "Connect your FieldData account first: Good Earth sends you one Nostr message to approve."


class FieldDataError(ValueError):
    """FieldData could not answer. A ValueError, so the fare is refunded. Never carries a token."""


class FieldDataNotConnected(FieldDataError):
    """This patron has no working connection to FieldData."""


@dataclass(frozen=True)
class Tokens:
    client_id: str = field(repr=False)
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    expires_at: float = 0.0

    def stored(self) -> dict[str, str]:
        return {k: str(v) for k, v in asdict(self).items()}

    @staticmethod
    def from_stored(creds: dict[str, str] | None) -> Tokens | None:
        if not creds or not all(creds.get(k) for k in ("client_id", "access_token", "refresh_token")):
            return None
        try:
            expires_at = float(creds.get("expires_at") or 0)
        except ValueError:
            expires_at = 0.0
        return Tokens(creds["client_id"], creds["access_token"], creds["refresh_token"], expires_at)


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


async def _connect_holder(http: httpx.AsyncClient) -> Tokens:
    """Register, take a code by fetch, and exchange it. Nothing here is for a person to see."""
    reg = await http.post(f"{BASE_URL}/register", json={
        "client_name": "Good Earth",
        "redirect_uris": [REDIRECT_URI],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    })
    if not reg.is_success:
        raise FieldDataError(f"FieldData would not register this connection (HTTP {reg.status_code}).")
    client_id = reg.json()["client_id"]
    verifier, challenge = _pkce()
    state = secrets.token_urlsafe(16)
    auth = await http.get(f"{BASE_URL}/authorize", headers={"Accept": "application/json"}, params={
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": MCP_URL,
    })
    if not auth.is_success:
        raise FieldDataError(f"FieldData would not connect (HTTP {auth.status_code}).")
    issued = parse_qs(urlparse(auth.json().get("redirect_uri", "")).query)
    code = (issued.get("code") or [""])[0]
    if not code or (issued.get("state") or [""])[0] != state:
        raise FieldDataError("FieldData's reply did not match this connection.")
    return await _token(http, client_id, {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": verifier,
    })


async def _token(http: httpx.AsyncClient, client_id: str, form: dict[str, str]) -> Tokens:
    answer = await http.post(f"{BASE_URL}/token", data={**form, "client_id": client_id, "resource": MCP_URL})
    if answer.status_code in (400, 401):
        raise FieldDataNotConnected(CONNECT_FIRST)
    if not answer.is_success:
        raise FieldDataError(f"FieldData returned HTTP {answer.status_code}.")
    body = answer.json()
    return Tokens(
        client_id,
        body["access_token"],
        body["refresh_token"],
        time.time() + float(body.get("expires_in") or 3600),
    )


async def _post_tool(access_token: str, tool: str, args: dict[str, Any]) -> dict[str, Any]:
    """One FieldData tool call, as any MCP client makes it."""
    from fastmcp import Client

    async with Client(MCP_URL, auth=access_token) as client:
        result = await client.call_tool(f"{TOOL_PREFIX}{tool}", args, raise_on_error=False)
    return result.structured_content or {}


class FieldData:
    """Each patron's connection to FieldData, and calls made through it."""

    def __init__(
        self,
        load: Callable[[str], Awaitable[dict[str, str] | None]],
        store: Callable[[str, dict[str, str]], Awaitable[bool]],
    ) -> None:
        self._load = load
        self._store = store
        # A refresh token works once, so one patron refreshes one at a time.
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def _keep(self, npub: str, tokens: Tokens) -> Tokens:
        if not await self._store(npub, tokens.stored()):
            raise FieldDataError("Your FieldData connection could not be saved. Try again shortly.")
        return tokens

    async def _tokens(self, npub: str, *, renew: bool = False) -> Tokens:
        async with self._locks[npub]:
            tokens = Tokens.from_stored(await self._load(npub))
            if tokens is None:
                raise FieldDataNotConnected(CONNECT_FIRST)
            if not renew and tokens.expires_at > time.time() + _EARLY_SECONDS:
                return tokens
            async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
                try:
                    fresh = await _token(http, tokens.client_id, {
                        "grant_type": "refresh_token", "refresh_token": tokens.refresh_token,
                    })
                except httpx.HTTPError:
                    raise FieldDataError("FieldData could not be reached. Try again shortly.") from None
            return await self._keep(npub, fresh)

    async def _tool(self, tokens: Tokens, tool: str, args: dict[str, Any]) -> dict[str, Any]:
        try:
            return await _post_tool(tokens.access_token, tool, args)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                raise FieldDataNotConnected(CONNECT_FIRST) from None
            raise FieldDataError(f"FieldData returned HTTP {exc.response.status_code}.") from None
        except Exception as exc:  # noqa: BLE001
            # The text of a transport failure is not ours to pass on.
            logger.warning("FieldData call %s failed: %s", tool, type(exc).__name__)
            raise FieldDataError("FieldData could not be reached. Try again shortly.") from None

    async def connect(self, npub: str) -> dict[str, Any]:
        """Make sure this patron has a holder, and send the DM that proves their npub into it."""
        async with self._locks[npub]:
            tokens = Tokens.from_stored(await self._load(npub))
            if tokens is None:
                async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
                    try:
                        tokens = await _connect_holder(http)
                    except httpx.HTTPError:
                        raise FieldDataError("FieldData could not be reached. Try again shortly.") from None
                await self._keep(npub, tokens)
        tokens = await self._tokens(npub)
        answer = await self._tool(tokens, "request_npub_proof", {
            "patron_npub": npub,
            "reason": "Good Earth is asking to read your chosen stations from FieldData for your Plots.",
        })
        if not answer.get("nonce"):
            raise FieldDataError(str(answer.get("error") or answer.get("message") or "FieldData sent no message."))
        return {"phrase": answer["nonce"], "relay": answer.get("rendezvous_relay", "")}

    async def finish_connect(self, npub: str, phrase: str) -> None:
        """Collect the patron's reply, once."""
        answer = await self._tool(await self._tokens(npub), "receive_npub_proof", {"patron_npub": npub, "nonce": phrase})
        if answer.get("success") is False or answer.get("error"):
            raise FieldDataError(str(answer.get("error") or "No reply was found yet."))

    async def call(self, npub: str, tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        """A FieldData tool as this patron. FieldData's rules and fares apply as for any client."""
        merged = {"npub": npub, **(args or {})}
        tokens = await self._tokens(npub)
        try:
            answer = await self._tool(tokens, tool, merged)
        except FieldDataNotConnected:
            # An access token can go early; a refused refresh then says connect.
            answer = await self._tool(await self._tokens(npub, renew=True), tool, merged)
        if answer.get("error_code") == "proof_required":
            raise FieldDataNotConnected(CONNECT_FIRST)
        if answer.get("success") is False:
            raise FieldDataError(str(answer.get("error") or "FieldData refused that request."))
        return answer
