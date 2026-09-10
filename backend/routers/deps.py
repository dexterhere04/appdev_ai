"""FastAPI dependencies for auth (Contract 2) and a project-scope resolver."""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Header, Request

import db
from models.user import User
from models.project import Project
from security import sha256


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    request: Request = None,
) -> User:
    """Resolve the Bearer session token to a User or raise 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "unauthorized")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "unauthorized")
    user = db.user_for_session(sha256(token))
    if user is None:
        raise HTTPException(401, "unauthorized")
    if request is not None:
        request.state.user_id = user.id  # for access logging (no PII beyond id)
    return user


def require_project(
    pid: str, user: User = Depends(get_current_user)
) -> Project:
    """Contract 3: ownership guard used by every project route."""
    try:
        return db.require_project(pid, user)
    except db.NotFound:
        raise HTTPException(404, "project not found")
    except db.Forbidden:
        raise HTTPException(403, "forbidden")
