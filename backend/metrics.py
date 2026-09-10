"""Structured logging + lightweight operational metrics (Agent 8).

- JSON-lines request logging middleware (request id, user id, method, path,
  status, latency) that never logs secrets or file contents.
- In-process counters (builds, AI calls, dev starts, errors) exposed at
  /metrics for scraping/alerting.

Single-node v1: in-memory counters are acceptable; a real metrics exporter
(Prometheus) can swap in later without changing the endpoint contract.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections import defaultdict
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

log = logging.getLogger("app")

_COUNTERS: dict[str, int] = defaultdict(int)


def inc(name: str, n: int = 1) -> None:
    _COUNTERS[name] += n


def counters() -> dict[str, int]:
    return dict(_COUNTERS)


def setup_logging(level: int = logging.INFO) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Log one JSON line per request with latency + user when present."""

    async def dispatch(self, request: Request, call_next: Callable):
        start = time.perf_counter()
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        try:
            response = await call_next(request)
        except Exception:
            inc("errors")
            log.exception("unhandled error on %s %s", request.method, request.url.path)
            response = JSONResponse({"detail": "internal error"}, status_code=500)
        latency_ms = (time.perf_counter() - start) * 1000
        user_id = getattr(request.state, "user_id", None)
        log.info(json.dumps({
            "req_id": request_id,
            "user": user_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "ms": round(latency_ms, 1),
        }))
        if response.status_code >= 500:
            inc("errors_5xx")
        elif response.status_code >= 400:
            inc("errors_4xx")
        return response
