from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Project:
    id: str
    owner_id: str
    name: str
    created_at: str
    updated_at: str

    def public(self) -> dict:
        return asdict(self)
