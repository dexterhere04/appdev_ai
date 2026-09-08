# Testing Notes

Test run from a clean checkout on **2026-09-01**. Environment: Linux, Python 3.14,
Node 26 / npm 12, Flutter 3.41.5, Docker.

## What was verified

### Backend — works

| Check | Result |
| ----- | ------ |
| `uvicorn server:app` starts and serves on 5000 | ✅ |
| `python server.py` starts a server | ❌ **exits 0 immediately** (no `__main__` block) |
| `POST /api/workspaces` (runs `flutter create`) | ✅ returned `5a5482c0` |
| `GET /api/workspaces/{wid}` file tree | ✅ 13 top-level entries |
| `GET .../file?path=lib/main.dart` | ✅ content returned |
| `PUT .../file` write + `GET` read-back | ✅ persisted |
| Path traversal on file endpoints (`../server.py`, `/etc/passwd`) | ✅ blocked → 400 |
| `POST /build` | ✅ returns `{logs, preview}` |
| `GET /build/logs` SSE: `flutter pub get` + `flutter build web` | ✅ full green build (`__EXIT__ 0` twice); correctly reported `__EXIT__ 1` when `main.dart` was intentionally broken |
| Preview `index.html` `<base href>` injection | ✅ `"/preview/<wid>/build/web/"` |
| Preview static assets (`flutter_bootstrap.js`) | ✅ 200 |
| `/preview/{wid}/build/web/../../.../etc/passwd` traversal | ⚠️ 404 in this deployment — uvicorn normalizes `..`; **not** defensively validated in app code |

### Frontend — broken

| Check | Result |
| ----- | ------ |
| `npm install` | ⚠️ fails with `EALLOWREMOTE` unless `--allow-remote=all` — `package-lock.json` has one `resolved` URL pointing at `registry.npmmirror.com` |
| `npm run lint` | ❌ **8 errors** — `no-explicit-any` ×7 (CodeEditor.tsx, IDE.tsx), `set-state-in-effect` ×1 (PreviewPane.tsx) |
| `npm run build` (Next.js 16 + Turbopack) | ❌ **TypeScript compile fails** — `FileNode` requires `id` but `IDE.tsx` `buildTree` omits it and adds a non-existent `path` property |
| `docker compose config` | ✅ valid (warning: obsolete `version` key) |

### Flutter template

- `templates/blank/` copies, `flutter create . --platforms web`, and
  `flutter build web --release` all succeeded inside a real workspace.

## Bottom line

The **backend works end-to-end** when started with `uvicorn` (and with the Flutter
SDK installed). The **frontend does not compile** (`next build` fails) and cannot
talk to the backend anyway (wrong host/port/paths — see `issues.md` #3). The
Docker setup is broken because the backend image runs `python server.py` and
lacks the Flutter SDK (`issues.md` #1).

Full issue list: [`issues.md`](../issues.md).
