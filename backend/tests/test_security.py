"""Security regression tests (docs/TESTING.md, adapted to project API)."""


def test_unauthenticated_project_access_401(client, make_project):
    p = make_project({"lib/main.dart": "void main(){}"})
    pid = p["project"].id
    assert client.get(f"/api/projects/{pid}/files").status_code == 401
    assert client.put(f"/api/projects/{pid}/file", json={"path": "a.dart", "content": "x"}).status_code == 401
    assert client.post(f"/api/projects/{pid}/build").status_code == 401


def test_cross_user_forbidden_403(client, make_user, make_project):
    p = make_project({"lib/main.dart": "void main(){}"})
    _, other_headers, _ = make_user()
    pid = p["project"].id
    r = client.get(f"/api/projects/{pid}/files", headers=other_headers)
    assert r.status_code == 403
    r = client.put(
        f"/api/projects/{pid}/file",
        headers=other_headers,
        json={"path": "lib/main.dart", "content": "hacked"},
    )
    assert r.status_code == 403


def test_missing_project_404(client, make_project):
    p = make_project()
    pid = "0" * 32  # valid uuid shape, not present
    assert client.get(f"/api/projects/{pid}/files", headers=p["headers"]).status_code == 404


def test_malformed_pid_404(client, make_project):
    p = make_project()
    assert client.get("/api/projects/ZZZZ/f", headers=p["headers"]).status_code in (404, 422)


def test_preview_without_access_404(client, make_project):
    p = make_project({"build/web/index.html": "<html></html>"})
    assert client.get(f"/preview/{p['project'].id}/index.html").status_code == 404


def test_preview_with_valid_access(client, make_project):
    p = make_project({"build/web/index.html": "<html><head></head></html>"})
    # A token is only obtainable via the authenticated build endpoint; simulate
    # by minting through the same code path used there.
    import preview_token
    access = preview_token.mint(p["project"].id)
    r = client.get(f"/preview/{p['project'].id}/index.html?access={access}")
    assert r.status_code == 200
    assert "base href" in r.text or "index.html" in r.text


def test_preview_forged_access_404(client, make_project):
    p = make_project({"build/web/index.html": "<html></html>"})
    r = client.get(f"/preview/{p['project'].id}/index.html?access=fake.token.value")
    assert r.status_code == 404


def test_invalid_relpath_write_400(client, make_project):
    p = make_project()
    pid = p["project"].id
    for bad in ["../escape", "/abs", "a/b/../../c"]:
        r = client.put(f"/api/projects/{pid}/file", headers=p["headers"], json={"path": bad, "content": "x"})
        assert r.status_code == 400, bad


def test_healthz_unauthenticated(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
