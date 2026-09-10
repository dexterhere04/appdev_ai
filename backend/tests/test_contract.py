"""Auth + contract regression tests (docs/TESTING.md, adapted)."""
import os
import uuid


def test_register_login_me_logout(client):
    email = f"a{uuid.uuid4().hex[:8]}@test.dev"
    pw = "password123"

    r = client.post("/api/auth/register", json={"email": email, "password": pw})
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert r.json()["user"]["email"] == email

    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200 and r.json()["user"]["email"] == email

    r = client.post("/api/auth/logout", headers=headers)
    assert r.status_code == 200
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 401


def test_login_bad_credentials(client, make_user):
    email, _, _ = make_user()
    r = client.post("/api/auth/login", json={"email": email, "password": "wrongpass1"})
    assert r.status_code == 401


def test_register_duplicate_email(client, make_user):
    email, _, _ = make_user()
    r = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 409


def test_register_short_password_400(client):
    r = client.post("/api/auth/register", json={"email": "x@test.dev", "password": "short"})
    assert r.status_code == 400


def test_build_post_returns_urls(client, make_project):
    p = make_project({"build/web/index.html": "<html></html>"})
    r = client.post(f"/api/projects/{p['project'].id}/build", headers=p["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["preview"].startswith(f"/preview/{p['project'].id}/index.html?access=")


def test_ai_requires_auth(client, make_project):
    p = make_project()
    r = client.post(f"/api/projects/{p['project'].id}/ai/generate", json={"prompt": "x"})
    assert r.status_code == 401


def test_ai_empty_prompt_400(client, make_project):
    p = make_project()
    r = client.post(f"/api/projects/{p['project'].id}/ai/generate", headers=p["headers"], json={})
    assert r.status_code == 400


def test_build_missing_file_404(client, make_project):
    p = make_project()
    pid = "f" * 32
    assert client.post(f"/api/projects/{pid}/build", headers=p["headers"]).status_code == 404
