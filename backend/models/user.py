from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class User:
    id: str
    email: str
    pw_hash: str
    created_at: str

    def public(self) -> dict:
        d = asdict(self)
        d.pop("pw_hash", None)
        return d
