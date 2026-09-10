"""Simple in-memory sliding-window rate limiter (Agent 3 hardening).

Gates abuse-prone endpoints: auth (register/login) and project creation.
Single-node in-memory state is acceptable for v1; per-IP keying.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque

import config

_windows: dict[str, Deque[float]] = defaultdict(deque)


def _cleanup(now: float) -> None:
    stale = [k for k, q in _windows.items() if not q or (now - q[-1]) > 120]
    for k in stale:
        _windows.pop(k, None)


def check_limit(key: str, limit_per_min: int) -> bool:
    """Return True if allowed, False if over the limit."""
    if not config.RATE_LIMIT_ENABLED:
        return True
    now = time.monotonic()
    q = _windows[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= limit_per_min:
        _cleanup(now)
        return False
    q.append(now)
    return True
