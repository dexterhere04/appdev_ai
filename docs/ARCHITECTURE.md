# Architecture

## High-level flow

```
┌──────────────────────────┐         ┌──────────────────────────────────────┐
│       Frontend (3000)    │  HTTP   │         Backend (5000)               │
│  Next.js 16 / React 19   │◄───────►│  FastAPI                            │
│  AuthProvider            │  +SSE   │   routers/                          │
│  BuildProvider (project) │         │    ├─ auth.py        (sessions)     │
│  IDE (bundled Monaco)    │         │    ├─ projects.py    (CRUD+files)   │
│  FileExplorer            │         │    ├─ build.py       (SSE build)    │
│  PreviewPane (iframe)    │         │    ├─ preview.py     (signed serve) │
│  AI prompt bar (SSE)     │         │    ├─ dev.py         (dev lifecycle)│
│                          │         │   db.py        (SQLite metadata)    │
│                          │         │   workspace.py  (files + flutter)   │
│                          │         │   envpolicy.py  (secret-free env)   │
│                          │         │   ai_pipeline.py(validated apply)   │
│                          │         │   lifecycle.py  (GC loop)           │
│                          │         │   metrics.py    (logs + counters)   │
│                          │         └──────────────┬──────────────────────┘
│                          │                        ▼
│                          │            Flutter SDK (per project dir)
└──────────────────────────┘
```

## Identity & tenancy

- Accounts: email + password (PBKDF2 hashed). Session = opaque token; only its
  SHA-256 is stored, in the `sessions` table.
- **Every** project route resolves the caller via `get_current_user`
  (`routers/deps.py`) and enforces ownership via `db.require_project(pid, user)`
  (403 on mismatch). Unauthenticated → 401.
- On-disk ownership is structural: projects live under
  `workspaces/<owner_id>/<pid>/`, so a route-guard bypass still cannot read
  another user's tree.
- No `wid` capability tokens remain; preview/dev access uses short-lived signed
  tokens minted only inside authenticated handlers.

## Metadata store (`db.py`)

SQLite at `backend/var/app.db` (env `FCB_DB_PATH`), WAL mode, schema in
`db.init_db()`: `users`, `sessions`, `projects`. Routers never write SQL — they
call repository functions. `docs/CONTRACTS.md` freezes the schema and route
shapes.

## Build & preview

- `POST /api/projects/{pid}/build` cleans `build/web` and returns `{logs,
  preview}`; it does **not** build. Opening `GET .../build/logs` runs
  `flutter pub get` then `flutter build web --release --pwa-strategy=none`
  under a per-project lock + a global concurrency semaphore
  (`config.MAX_CONCURRENT_BUILDS`). A **single** `data: __EXIT__ <code>`
  sentinel closes the stream. `POST .../build/cancel` closes the generator,
  killing subprocesses.
- Subprocesses get a **secret-free allowlist env** (`envpolicy.build_env()`)
  plus CPU/AS rlimits and a hard timeout — never `os.environ`.
- `GET /preview/{pid}/...` serves the release build. The `?access=` token (or
  the path-scoped HttpOnly cookie set on `index.html`) proves authorization;
  no token → 404. `index.html` `<base href>` is rewritten to `/preview/{pid}/`.

## Hot-reload dev preview

- `POST /api/projects/{pid}/dev/start` runs `flutter run -d web-server` on a
  per-project port (per-user cap). The returned `url` is a **direct origin**
  `http://<host>:<port>/`. Flutter's debug tooling (DWDS) opens a root-absolute
  WebSocket (`ws://<host>:<port>/$dwdsSseHandler`) that cannot live behind a
  shared sub-path proxy, so each dev server must be reachable at its own origin.
  docker-compose publishes `8100-8131` for this. Because the dev origin differs
  from the app origin, its iframe gets `sandbox="allow-scripts
  allow-same-origin"` (which only grants the dev origin, not the app's).
- Run mode is an explicit user choice in the frontend (Hot reload vs Build),
  not derived from `NODE_ENV`.

## AI pipeline

- `ai_pipeline.run_pipeline()` runs the multi-agent Gemini coordinator and
  **normalizes its output to validated `{path, content}` files** that are
  written into the project via the same repository as manual edits.
- Model output is untrusted: path charset/`..` checks, reserved-root rejection,
  per-file size + count caps (`ai_pipeline.MAX_*`).
- Without a `GEMINI_API_KEY` the coordinator import fails → a deterministic
  fallback Flutter app is generated (same response shape), so "get a scaffold"
  never depends on the model. Progress is streamed agent-by-agent on the
  `/generate/stream` variant.

## Lifecycle, ops

- `lifecycle.py` runs a periodic GC: purges expired sessions and removes orphan
  project dirs (dirs with no DB row), pruning empty owner dirs.
- `metrics.py` adds JSON-lines access logging (request id, user id, latency —
  no secrets/PII beyond user id) and in-process counters at `/metrics`.
- `config.py` centralizes env config; deploy-time secrets (`FCB_SECRET`,
  `GEMINI_API_KEY`) are never baked into images or build environments.

## Docker (`docker-compose.yaml`)

- `backend`: always on. Flutter SDK base image, dedicated venv, pinned deps,
  resource limits (`mem_limit`, `cpus`), healthcheck on `/healthz`. Secrets and
  the CORS allowlist come from environment (`FCB_SECRET`, `FCB_ALLOWED_ORIGINS`).
- `frontend` (profile `dev`): hot reload, bind mount.
- `frontend-prod` (profile `prod`): Next standalone runtime, `NEXT_PUBLIC_API_URL`
  inlined at build.

## Frontend

- `src/context/AuthContext.tsx` — session (login/register/logout, token restore).
- `src/context/BuildContext.tsx` — active project, projects list, run mode
  (`dev` | `release`), preview/build state, SSE consumers.
- `src/lib/api.ts` — single authed client (`api.*`) + SSE body reader (auth-usable,
  since `EventSource` cannot send headers).
- Monaco is bundled locally (no runtime CDN), wired through Turbopack workers.
