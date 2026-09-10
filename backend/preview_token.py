"""Signed, short-lived preview access tokens.

The built app runs in an iframe and cannot send the `Authorization` header, so
preview/dev URLs carry a signed `access` token minted only inside authenticated
API handlers. Subresource requests after the first page load authenticate via a
scoped HMAC cookie set on the index response.

HMAC-SHA256 over `pid|exp`, keyed by FCB_SECRET (deploy-time secret).
"""
from __future__ import annotations

import hmac
import os
import time

_TOKEN_TTL_S = 6 * 3600  # 6h; refreshed whenever a build completes

_ALGO = "v1"


def _key() -> bytes:
    secret = os.getenv("FCB_SECRET")
    if not secret:
        raise RuntimeError("FCB_SECRET must be set to mint preview tokens")
    return secret.encode("utf-8")


def _sign(pid: str, exp: int) -> str:
    msg = f"{_ALGO}|{pid}|{exp}"
    return hmac.new(_key(), msg.encode("utf-8"), "sha256").hexdigest()


def mint(pid: str, ttl_s: int = _TOKEN_TTL_S) -> str:
    exp = int(time.time()) + ttl_s
    sig = _sign(pid, exp)
    return f"{_ALGO}.{exp}.{sig}.{pid}"


def verify(token: str, pid: str) -> bool:
    """Return True if the token is valid, unexpired, and bound to pid."""
    try:
        algo, exp_s, sig, token_pid = token.split(".")
        if algo != _ALGO or token_pid != pid:
            return False
        exp = int(exp_s)
        if time.time() > exp:
            return False
        return hmac.compare_digest(sig, _sign(pid, exp))
    except (ValueError, AttributeError):
        return False
