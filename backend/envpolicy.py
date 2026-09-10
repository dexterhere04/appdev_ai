"""Build environment policy (Agent 3).

Every `flutter` subprocess (build, dev-run, provision) must run with a strict
environment allowlist — NEVER `os.environ` — so server secrets (GEMINI_API_KEY,
FCB_SECRET, DB paths, …) cannot be read or exfiltrated by user code or `pub`
dependencies. This is Contract-adjacent W2 hardening.
"""
from __future__ import annotations

import os
from pathlib import Path

# Keys a build/dev subprocess may see. Everything else — including anything that
# looks like a secret — is dropped.
_ALLOWLIST = {
    # Flutter/Dart toolchain
    "PATH",
    "HOME",
    "PUB_CACHE",
    "FLUTTER_HOME",
    "DART_HOME",
    "FLUTTER_ROOT",
    "PUB_ENVIRONMENT",
    # Locale / terminal hygiene
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "TMPDIR",
    "TEMP",
    "TMP",
    # CI-ish flags (harmless, useful for flutter internals)
    "CI",
    "NO_COLOR",
    "ANDROID_HOME",  # unused for web builds but harmless if present
}


def build_env(*, extra: dict | None = None) -> dict:
    """A minimal, secret-free environment for flutter subprocesses.

    Starts from the allowlisted subset of the current environment (so local dev
    PATHs survive) then layers explicit overrides. Any var in `extra` is allowed
    only if it is on the allowlist; callers cannot smuggle secrets through.
    """
    env = {k: os.environ[k] for k in _ALLOWLIST if k in os.environ}
    # A pub cache inside the project would show up in the file tree / leak disk;
    # default to the user cache (containers set HOME).
    env.setdefault("PUB_CACHE", os.path.expanduser("~/.pub-cache"))
    if extra:
        for k, v in extra.items():
            if k in _ALLOWLIST or k.startswith("PUB_"):
                env[k] = v
    return env


def is_secret_free(env: dict) -> bool:
    """Test hook: true when no known secret names leak into an env dict."""
    joined = " ".join(f"{k}={v}".lower() for k, v in env.items())
    for needle in ("gemini_api_key", "langchain_api_key", "fcb_secret", "api_key=", "secret=", "token="):
        if needle in joined:
            return False
    return True
