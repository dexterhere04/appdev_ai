from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel, EmailStr

import config
import db
import ratelimit
import security
from models.user import User
from .deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class Credentials(BaseModel):
    email: EmailStr
    password: str


class SessionOut(BaseModel):
    token: str
    user: dict


def _bearer_token(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "unauthorized")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "unauthorized")
    return token


def _new_session(user: User) -> SessionOut:
    token, token_hash = security.new_session_token()
    expires = (datetime.now(timezone.utc) + timedelta(days=config.SESSION_TTL_DAYS)).isoformat()
    db.create_session(user.id, token_hash, expires)
    return SessionOut(token=token, user=user.public())


@router.post("/register", status_code=201)
def register(creds: Credentials, request: Request):
    if not ratelimit.check_limit(f"auth:{_client_ip(request)}", config.RATE_LIMIT_AUTH_PER_MIN):
        raise HTTPException(429, "too many attempts, slow down")
    if len(creds.password) < 8:
        raise HTTPException(400, "password must be at least 8 characters")
    try:
        user = db.create_user(creds.email.lower(), security.hash_password(creds.password))
    except db.EmailTaken:
        raise HTTPException(409, "an account with this email already exists")
    return _new_session(user)


@router.post("/login")
def login(creds: Credentials, request: Request):
    if not ratelimit.check_limit(f"auth:{_client_ip(request)}", config.RATE_LIMIT_AUTH_PER_MIN):
        raise HTTPException(429, "too many attempts, slow down")
    user = db.get_user_by_email(creds.email.lower())
    if user is None or not security.verify_password(creds.password, user.pw_hash):
        raise HTTPException(401, "invalid email or password")
    return _new_session(user)


@router.post("/logout")
def logout(token: str = Depends(_bearer_token)):
    db.delete_session(security.sha256(token))
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": user.public()}
