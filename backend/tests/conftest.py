"""Shared fixtures for backend tests.

The whole backend is env-configured, so tests point FCB_DB_PATH and
FCB_WORKSPACES_ROOT at temp dirs BEFORE any backend module is imported.
Integration-marked tests (real flutter) live in test_integration.py.
"""
import os
import sys
import tempfile
import uuid
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# ---- isolate DB + workspace storage + secrets per test session ----
_TMP = tempfile.mkdtemp(prefix="fcb-tests-")
os.environ["FCB_DB_PATH"] = os.path.join(_TMP, "app.db")
os.environ["FCB_WORKSPACES_ROOT"] = os.path.join(_TMP, "workspaces")
os.environ["FCB_SECRET"] = "test-secret"
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("LANGCHAIN_API_KEY", None)
os.environ.pop("LANGCHAIN_TRACING_V2", None)
os.environ["FCB_RATE_LIMIT_ENABLED"] = "false"

import db  # noqa: E402
import workspace as ws  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    db.init_db()
    yield
    # Recreate the store so tests are hermetic (session scoped file per test).
    try:
        os.remove(os.environ["FCB_DB_PATH"])
    except FileNotFoundError:
        pass
    db.init_db()


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient
    import server

    with TestClient(server.app) as c:
        yield c


@pytest.fixture()
def make_user(client):
    """Register a throwaway user; returns (email, auth_headers, user_json)."""
    created = []

    def _make():
        email = f"u{uuid.uuid4().hex[:10]}@test.dev"
        pw = "password123"
        r = client.post("/api/auth/register", json={"email": email, "password": pw})
        assert r.status_code == 201, r.text
        body = r.json()
        headers = {"Authorization": f"Bearer {body['token']}"}
        created.append(body)
        return email, headers, body["user"]

    yield _make
    # optional cleanup is unnecessary (hermetic db per test)


@pytest.fixture()
def make_project(client, make_user, tmp_path, monkeypatch):
    """Factory: real user + DB row + on-disk project dir (no flutter needed).

    Returns the project dict and its resolved base Path.
    """
    monkeypatch.setattr(ws, "WORKSPACES", Path(os.environ["FCB_WORKSPACES_ROOT"]))

    def _make(files: dict[str, str | bytes] | None = None, name="Test project"):
        email, headers, user = make_user()
        project = db.create_project(user["id"], name)
        base = ws.project_base(user["id"], project.id)
        (base / "lib").mkdir(parents=True, exist_ok=True)
        for rel, content in (files or {}).items():
            p = base / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "wb" if isinstance(content, bytes) else "w") as f:
                f.write(content)
        return {"email": email, "headers": headers, "user": user, "project": project, "base": base}

    return _make
