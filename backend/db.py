"""SQLite metadata store + repository functions.

Single-node v1: one SQLite file accessed via short-lived connections (WAL).
All ownership checks funnel through `require_project`. No SQL is written by
routers — they only call the functions here.
"""
from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from config import DB_PATH
from models.user import User
from models.project import Project

UUID_RE = re.compile(r"^[0-9a-f]{32}$")


class DbError(Exception):
    pass


class NotFound(DbError):
    pass


class Forbidden(DbError):
    pass


class EmailTaken(DbError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id         TEXT PRIMARY KEY,
                email      TEXT UNIQUE NOT NULL,
                pw_hash    TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
                id         TEXT PRIMARY KEY,
                owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name       TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            """
        )


# ---- users ----

def create_user(email: str, pw_hash: str) -> User:
    user_id = uuid.uuid4().hex
    with _connect() as conn:
        try:
            conn.execute(
                "INSERT INTO users (id, email, pw_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, email, pw_hash, _now()),
            )
        except sqlite3.IntegrityError:
            raise EmailTaken(email)
    user = get_user_by_id(user_id)
    assert user is not None
    return user


def get_user_by_id(user_id: str) -> Optional[User]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return User(**dict(row)) if row else None


def get_user_by_email(email: str) -> Optional[User]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return User(**dict(row)) if row else None


# ---- sessions ----

def create_session(user_id: str, token_hash: str, expires_at: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token_hash, user_id, _now(), expires_at),
        )


def user_for_session(token_hash: str) -> Optional[User]:
    with _connect() as conn:
        row = conn.execute(
            """SELECT u.* FROM sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > ?""",
            (token_hash, _now()),
        ).fetchone()
    return User(**dict(row)) if row else None


def delete_session(token_hash: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


# ---- projects ----

def _row_to_project(row: sqlite3.Row) -> Project:
    return Project(**dict(row))


def list_projects(owner_id: str) -> list[Project]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
            (owner_id,),
        ).fetchall()
    return [_row_to_project(r) for r in rows]


def list_all_project_keys() -> list[tuple[str, str]]:
    """(owner_id, project_id) pairs for every row — used by GC orphan scan."""
    with _connect() as conn:
        rows = conn.execute("SELECT owner_id, id FROM projects").fetchall()
    return [(r["owner_id"], r["id"]) for r in rows]


def get_project(project_id: str) -> Optional[Project]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
    return _row_to_project(row) if row else None


def require_project(project_id: str, user: User) -> Project:
    """Contract 3: returns the project or raises NotFound/Forbidden."""
    if not UUID_RE.match(project_id):
        raise NotFound(project_id)
    project = get_project(project_id)
    if project is None:
        raise NotFound(project_id)
    if project.owner_id != user.id:
        raise Forbidden(project_id)
    return project


def create_project(owner_id: str, name: str) -> Project:
    pid = uuid.uuid4().hex
    with _connect() as conn:
        conn.execute(
            "INSERT INTO projects (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (pid, owner_id, name, _now(), _now()),
        )
    project = get_project(pid)
    assert project is not None
    return project


def project_count(owner_id: str) -> int:
    with _connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?", (owner_id,)
        ).fetchone()
    return int(row["n"])


def rename_project(project_id: str, name: str) -> Project:
    with _connect() as conn:
        conn.execute(
            "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?",
            (name, _now(), project_id),
        )
    project = get_project(project_id)
    assert project is not None
    return project


def touch_project(project_id: str) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ?", (_now(), project_id)
        )


def delete_project(project_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
