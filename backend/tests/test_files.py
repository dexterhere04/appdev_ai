"""File API + project persistence regression tests."""


def test_projects_crud(client, make_project):
    # list is empty for a fresh user
    _, headers, _ = _register(client)
    r = client.get("/api/projects", headers=headers)
    assert r.status_code == 200 and r.json()["projects"] == []

    # create via API (provisioning runs flutter create; skip by pre-creating)
    import db
    email, headers, user = _register(client)
    project = db.create_project(user["id"], "My App")
    r = client.get("/api/projects", headers=headers)
    assert any(p["id"] == project.id for p in r.json()["projects"])

    # rename
    r = client.patch(f"/api/projects/{project.id}", headers=headers, json={"name": "Renamed"})
    assert r.status_code == 200
    assert r.json()["project"]["name"] == "Renamed"

    # delete
    r = client.delete(f"/api/projects/{project.id}", headers=headers)
    assert r.status_code == 200
    r = client.get("/api/projects", headers=headers)
    assert all(p["id"] != project.id for p in r.json()["projects"])


def _register(client):
    import uuid
    email = f"cr{uuid.uuid4().hex[:8]}@test.dev"
    r = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201
    token = r.json()["token"]
    return email, {"Authorization": f"Bearer {token}"}, r.json()["user"]


def test_tree_recursive_shape(client, make_project):
    p = make_project({
        "lib/main.dart": "void main() {}",
        "lib/widgets/button.dart": "// btn",
        "assets/icon.png": b"\x89PNG\r\n\x1a\n" + b"\x00" * 16,
        "pubspec.yaml": "name: x",
    })
    r = client.get(f"/api/projects/{p['project'].id}/files", headers=p["headers"])
    assert r.status_code == 200
    files = r.json()["files"]
    by_name = {f["name"]: f for f in files}
    assert "lib" in by_name and by_name["lib"]["type"] == "dir"
    assert "assets" in by_name and by_name["assets"]["type"] == "dir"
    assert {c["name"] for c in by_name["lib"]["children"]} == {"main.dart", "widgets"}


def test_write_read_roundtrip(client, make_project):
    p = make_project()
    pid = p["project"].id
    r = client.put(f"/api/projects/{pid}/file", headers=p["headers"],
                   json={"path": "lib/main.dart", "content": "void main() {}"})
    assert r.status_code == 200
    r = client.get(f"/api/projects/{pid}/file", headers=p["headers"], params={"path": "lib/main.dart"})
    assert r.json()["content"] == "void main() {}"


def test_write_creates_parent_dirs(client, make_project):
    p = make_project()
    pid = p["project"].id
    r = client.put(f"/api/projects/{pid}/file", headers=p["headers"],
                   json={"path": "deep/nested/file.txt", "content": "hi"})
    assert r.status_code == 200
    r = client.get(f"/api/projects/{pid}/file", headers=p["headers"], params={"path": "deep/nested/file.txt"})
    assert r.json()["content"] == "hi"


def test_binary_detection_and_raw(client, make_project):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    p = make_project({"assets/icon.png": png})
    pid = p["project"].id
    r = client.get(f"/api/projects/{pid}/file", headers=p["headers"], params={"path": "assets/icon.png"})
    body = r.json()
    assert body["binary"] is True and body["image"] is True and body["size"] == len(png)
    r = client.get(f"/api/projects/{pid}/raw", headers=p["headers"], params={"path": "assets/icon.png"})
    assert r.content == png


def test_file_ops(client, make_project):
    p = make_project({"lib/a.dart": "//a", "lib/sub/b.dart": "//b"})
    pid = p["project"].id

    r = client.delete(f"/api/projects/{pid}/file", headers=p["headers"], params={"path": "lib/a.dart"})
    assert r.status_code == 200
    assert client.get(f"/api/projects/{pid}/file", headers=p["headers"], params={"path": "lib/a.dart"}).status_code == 404

    # non-empty dir delete -> 400
    assert client.delete(f"/api/projects/{pid}/file", headers=p["headers"], params={"path": "lib"}).status_code == 400

    # rename
    r = client.post(f"/api/projects/{pid}/file/rename", headers=p["headers"],
                    json={"path": "lib/sub/b.dart", "newPath": "lib/sub/c.dart"})
    assert r.status_code == 200
    assert client.get(f"/api/projects/{pid}/file", headers=p["headers"], params={"path": "lib/sub/c.dart"}).status_code == 200

    # folder create + duplicate
    r = client.post(f"/api/projects/{pid}/folder", headers=p["headers"], json={"path": "lib/newdir"})
    assert r.status_code == 200
    assert client.post(f"/api/projects/{pid}/folder", headers=p["headers"], json={"path": "lib/newdir"}).status_code == 400
