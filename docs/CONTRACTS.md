# Contracts — v1

Status: **frozen baseline** (owned by Agent 0). Changes require an approved PR
that updates this file *and* all dependent code in the same commit.

These eight contracts are the interfaces between the implementation agents.
Nothing is guessed — every agent reads what it needs here and codes to it.

---

## Contract 1 — Auth mechanism

**Decision (v1): Bearer-token sessions, not cookies.**

- `POST /api/auth/register` + `POST /api/auth/login` → `{ "token": "<opaque>" }`.
- The client sends `Authorization: Bearer <token>` on every request.
- Chosen over HTTP-only cookies because frontend (`:3000`/`:3001`) and backend
  (`:5000`) are **cross-origin**, which makes SameSite cookies awkward over plain
  HTTP in local dev and invites CSRF complexity. A header token is
  CSRF-immune, CORS-friendly, and trivially testable.
- Sessions are server-side (opaque token, hashed at rest), so revoking a session
  is instant and tokens can be short-lived + refreshable later.
- OAuth (Google/GitHub) can be added later as an alternative
  `login` grant **without changing this contract** (still issues the same
  `{ token }` shape).
- `GET /healthz` stays unauthenticated (container healthcheck).

## Contract 2 — Identity exposure

- FastAPI dependency `get_current_user` → returns a `User` object
  (`backend/models/user.py`), or raises:
  - **401** `{"detail": "unauthorized"}` when the token is missing/invalid/expired.
- Standard **403** `{"detail": "forbidden"}` for owner mismatches.
- Route authors add `user: User = Depends(get_current_user)`.

## Contract 3 — Ownership guard

- `backend/db.py` exposes `require_project(pid, user) -> Project`.
  Raises 404 if the project doesn't exist, 403 if `project.owner_id != user.id`.
- Every project-touching endpoint calls it before touching the filesystem.

## Contract 4 — Project route shape

Legacy `/api/workspaces/{wid}...` routes are **replaced** by:

| New route | Purpose |
| --------- | ------- |
| `GET /api/projects` | list my projects |
| `POST /api/projects` | create → `{ "project": {...} }` |
| `PATCH /api/projects/{pid}` | rename |
| `DELETE /api/projects/{pid}` | delete + GC files |
| `GET /api/projects/{pid}/files` | recursive file tree |
| `GET /api/projects/{pid}/file?path=` | read file |
| `PUT /api/projects/{pid}/file` | write file |
| `DELETE /api/projects/{pid}/file?path=` | delete file/dir |
| `POST /api/projects/{pid}/file/rename` | rename/move |
| `POST /api/projects/{pid}/folder` | create folder |
| `GET /api/projects/{pid}/raw?path=` | raw bytes (images) |
| `POST /api/projects/{pid}/build` | clean + return URLs |
| `GET /api/projects/{pid}/build/logs` | SSE build stream |
| `GET /preview/{pid}/{path:path}` | serve release build |
| `POST /api/projects/{pid}/dev/start` | start dev server → `{url, port}` |
| `POST /api/projects/{pid}/dev/hot-reload` | trigger reload |
| `POST /api/projects/{pid}/dev/stop` | stop dev server |
| `GET /api/projects/{pid}/dev/logs` | dev server logs |
| `POST /api/projects/{pid}/ai/generate` | AI generate into project |

`pid` is an opaque **UUID**. Path params under it are relative, validated by the
same rules as today (`^[A-Za-z0-9_\-./]+$`, no `..`, no absolute).

## Contract 5 — Data model

Metadata store: **SQLite** (single node, no extra infra) at
`backend/var/app.db`, accessed only through `backend/db.py` repository
functions. Schema (owned by Agent 2):

```sql
CREATE TABLE users (
  id         TEXT PRIMARY KEY,            -- uuid4 hex
  email      TEXT UNIQUE NOT NULL,
  pw_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,            -- uuid4 hex
  owner_id   TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Disk: projects live under `backend/workspaces/<owner_id>/<pid>/` so ownership is
structural, not just a DB row. Project `id == pid == directory name`.

## Contract 6 — Preview URL contract

The preview iframe shows the built app:

- **Release:** `/preview/{pid}/` on the backend origin (signed `?access=`;
  base-href rewritten). Served with `sandbox="allow-scripts"` only.
- **Hot-reload dev:** a **direct, per-project origin** `http://<host>:<port>/`
  returned by `POST .../dev/start`. Flutter's debug tooling (DWDS) opens a
  root-absolute WebSocket (`ws://<host>:<port>/$dwdsSseHandler`) that cannot
  live behind a shared sub-path, so each `flutter run -d web-server` must be
  reachable at its own origin. docker-compose publishes
  `DEV_WEB_PORT_START..COUNT` (8100-8131) for this. Because the dev origin is
  distinct from the app origin, its iframe uses
  `sandbox="allow-scripts allow-same-origin"` — that only grants the untrusted
  app its own origin, never the app's.

## Contract 7 — AI apply contract

- `POST /api/projects/{pid}/ai/generate` body `{ "prompt": str }`.
- Coordinator returns `{ "files": [ { "path": str, "content": str } ] }`.
- Server validates every `path` (Contract 4 path rules, no `.dart_tool`/`build`
  root segments), caps size/count, then applies via the file repository.
- Response `{ "applied": ["lib/main.dart", ...], "logs": [str] }`.
- Streaming progress (agent-by-agent) is a `text/event-stream` variant
  (same URL) that ends with the JSON payload on the final event.
- Deterministic no-LLM fallback must satisfy the same response shape.

## Contract 8 — Build-event contract

Keep the existing single-sentinel SSE exactly:

- `POST .../build` cleans `build/web` and returns `{ logs, preview }` URLs; it
  does **not** build.
- Opening `GET .../build/logs` runs `flutter pub get` then `flutter build web
  --release --pwa-strategy=none` (dev-server run is a separate path).
- A **single** `data: __EXIT__ <code>` closes the stream; `0` = success.
- Per-project lock serializes concurrent build triggers.
