"""Build SSE contract test (Contract 8) using a fake `flutter` on PATH.

A tiny fake flutter script emulates `pub get` and `build web` by writing the
expected artifacts and exiting with a controlled code, so we can assert the
SSE protocol (single `__EXIT__`, ordering, only-on-success build) without a
real SDK or a slow web build.
"""
import os
import stat
import textwrap

import pytest

FAKE_FLUTTER = textwrap.dedent("""\
    #!/bin/sh
    # args: flutter pub get | flutter build web --release --pwa-strategy=none
    if [ "$1" = "pub" ]; then
      echo "fake pub get ok"
      exit 0
    fi
    if [ "$1" = "build" ]; then
      echo "fake build output"
      mkdir -p build/web
      printf '<html><head></head></html>' > build/web/index.html
      exit "${FAKE_EXIT:-0}"
    fi
    exit 1
""")


@pytest.fixture()
def fake_flutter(tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    exe = bin_dir / "flutter"
    exe.write_text(FAKE_FLUTTER)
    exe.chmod(exe.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    monkeypatch.setenv("PATH", f"{bin_dir}:{os.environ.get('PATH', '')}")


def _login(client):
    import uuid
    email = f"sse{uuid.uuid4().hex[:8]}@test.dev"
    r = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _seed_project(client, headers, base):
    import db
    import uuid
    user_id = client.get("/api/auth/me", headers=headers).json()["user"]["id"]
    project = db.create_project(user_id, "SSE")
    pdir = base / user_id / project.id
    pdir.mkdir(parents=True)
    (pdir / "lib").mkdir()
    (pdir / "lib" / "main.dart").write_text("void main(){}")
    return project.id


def test_sse_single_sentinel_success(client, fake_flutter, tmp_path, monkeypatch):
    import workspace as ws
    monkeypatch.setattr(ws, "WORKSPACES", tmp_path)
    headers = _login(client)
    pid = _seed_project(client, headers, tmp_path)

    monkeypatch.setenv("FAKE_EXIT", "0")
    r = client.post(f"/api/projects/{pid}/build", headers=headers)
    assert r.status_code == 200
    logs_url = r.json()["logs"]

    # streaming SSE via TestClient: read the raw body
    with client.stream("GET", logs_url, headers=headers) as resp:
        body = "".join(resp.iter_text())

    lines = [ln for ln in body.split("\n") if ln.startswith("data: ")]
    data = [ln[len("data: "):] for ln in lines]
    exits = [d for d in data if d.startswith("__EXIT__")]
    assert len(exits) == 1, f"expected exactly one sentinel, got {exits}"
    assert exits[0] == "__EXIT__ 0"
    assert "fake build output" in " ".join(data)
    # preview artifact created
    assert (ws.project_base(_user_id(client, headers), pid) / "build" / "web" / "index.html").exists()


def test_sse_pub_get_failure_skips_build(client, fake_flutter, tmp_path, monkeypatch):
    import workspace as ws
    monkeypatch.setattr(ws, "WORKSPACES", tmp_path)
    headers = _login(client)
    pid = _seed_project(client, headers, tmp_path)

    # make pub get fail by swapping PATH so flutter pub get returns 1
    import pathlib
    bin_dir = pathlib.Path(tmp_path) / "bin"
    exe = bin_dir / "flutter"
    exe.write_text("#!/bin/sh\nif [ \"$1\" = \"pub\" ]; then echo boom; exit 1; fi\nexit 0\n")
    exe.chmod(0o755)

    with client.stream("GET", f"/api/projects/{pid}/build/logs", headers=headers) as resp:
        body = "".join(resp.iter_text())
    data = [ln[len("data: "):] for ln in body.split("\n") if ln.startswith("data: ")]
    exits = [d for d in data if d.startswith("__EXIT__")]
    assert exits == ["__EXIT__ 1"]


def _user_id(client, headers):
    return client.get("/api/auth/me", headers=headers).json()["user"]["id"]
