"""Central configuration for the backend.

Everything environment-driven lives here so routers/tests never read os.environ
directly. Secrets are injected at deploy time and never printed or inherited by
subprocesses (see docs/CONTRACTS.md W2).
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).parent.resolve()


def _env_flag(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [o.strip() for o in raw.split(",") if o.strip()]


# Where per-user project directories live. Env-overridable for tests/containers.
WORKSPACES_ROOT = Path(os.getenv("FCB_WORKSPACES_ROOT", str(ROOT / "workspaces")))

# SQLite metadata store (single-node v1). Env-overridable for tests.
DB_PATH = Path(os.getenv("FCB_DB_PATH", str(ROOT / "var" / "app.db")))

# CORS allowlist of the real frontend origin(s). No wildcard in production.
# Default covers the standard dev/prod ports. Compose derives it from
# FRONTEND_PORT so a custom port (e.g. 3002) is allowed automatically.
_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    f"http://localhost:{os.getenv('FRONTEND_PORT', '3000')}",
]
ALLOWED_ORIGINS = _env_list("FCB_ALLOWED_ORIGINS", _DEFAULT_ORIGINS)
CORS_ALLOW_CREDENTIALS = False

# Auth
SESSION_TTL_DAYS = int(os.getenv("FCB_SESSION_TTL_DAYS", "30"))
PBKDF2_ITERATIONS = int(os.getenv("FCB_PBKDF2_ITERATIONS", "310000"))

# Build/dev-run policy (consumed by Agent 3/4)
MAX_CONCURRENT_BUILDS = int(os.getenv("FCB_MAX_CONCURRENT_BUILDS", "2"))
MAX_PROJECTS_PER_USER = int(os.getenv("FCB_MAX_PROJECTS_PER_USER", "10"))
BUILD_TIMEOUT_S = int(os.getenv("FCB_BUILD_TIMEOUT_S", "600"))
BUILD_MEM_LIMIT_BYTES = int(os.getenv("FCB_BUILD_MEM_LIMIT_BYTES", str(2 * 1024**3)))
MAX_DEV_SERVERS_PER_USER = int(os.getenv("FCB_MAX_DEV_SERVERS_PER_USER", "3"))

# Auth + abuse throttling (simple in-memory sliding window)
RATE_LIMIT_ENABLED = _env_flag("FCB_RATE_LIMIT_ENABLED", True)
RATE_LIMIT_AUTH_PER_MIN = int(os.getenv("FCB_RATE_LIMIT_AUTH_PER_MIN", "10"))
RATE_LIMIT_CREATE_PER_MIN = int(os.getenv("FCB_RATE_LIMIT_CREATE_PER_MIN", "6"))
