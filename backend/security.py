"""Password hashing + opaque session tokens (no new runtime deps).

- Passwords: PBKDF2-HMAC-SHA256 with a per-user random salt, stored as
  `pbkdf2$<iterations>$<salt_b64>$<hash_b64>`.
- Sessions: random 32-byte token given to the client; only its SHA-256 is
  stored (db.create_session / user_for_session).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from config import PBKDF2_ITERATIONS

_ALGO = "pbkdf2"


def hash_password(password: str, iterations: int = PBKDF2_ITERATIONS) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return _encode(_ALGO, iterations, salt, dk)


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iter_str, salt_b64, hash_b64 = stored.split("$")
        if algo != _ALGO:
            return False
        iterations = int(iter_str)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
    except (ValueError, TypeError):
        return False
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(dk, expected)


def _encode(algo: str, iterations: int, salt: bytes, dk: bytes) -> str:
    return f"{algo}${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def new_session_token() -> tuple[str, str]:
    """Returns (client_token, sha256_hash_to_store)."""
    token = secrets.token_urlsafe(32)
    return token, sha256(token)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
