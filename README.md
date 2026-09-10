# Flutter Cloud Builder
<img width="1871" height="986" alt="image" src="https://github.com/user-attachments/assets/025eb4c8-e383-4032-ba40-4c9b5c031b0a" />

An in-browser IDE for building Flutter web apps. You write Dart in a bundled
Monaco editor, it's saved to a server-side project, compiled with the real
Flutter SDK, and previewed live — with hot reload as the default dev loop and an
optional AI pipeline that scaffolds apps from a text prompt into your project.

> **v1 status (in progress):** multi-tenant auth + projects + AI code-writing
> landed. See `docs/V1_RELEASE_PLAN.md` (what remains before GA) and
> `docs/CONTRACTS.md` (the frozen API contracts). The 20 issues in `issues.md`
> are fixed.

Two services, one repo:

| Service  | Path       | Tech                                         | Port |
| -------- | ---------- | -------------------------------------------- | ---- |
| Frontend | `frontend/`| Next.js 16 (App Router) + React 19 + Tailwind 4 | 3000 |
| Backend  | `backend/` | FastAPI (uvicorn) + SQLite + Flutter SDK     | 5000 |

---

## 1. High-level architecture

```
 Browser (3000/3001)                     Backend (5000)
 ┌──────────────────────────┐  Bearer+SSE ┌──────────────────────────────────────┐
 │ AuthProvider (session)   │────────────►│  routers/                             │
 │ BuildProvider (project)  │             │   ├─ auth.py     sessions/ownership   │
 │  ├─ IDE (bundled Monaco) │             │   ├─ projects.py CRUD + file ops      │
 │  ├─ FileExplorer         │             │   ├─ build.py    SSE release build    │
 │  ├─ PreviewPane (iframe) │◄────────────│   ├─ preview.py  signed /preview/{pid}│
 │  └─ AI prompt bar        │   SSE       │   └─ dev.py       dev lifecycle       │
 └──────────────────────────┘             │  db.py / workspace.py / envpolicy.py  │
                                          │  ai_pipeline.py / lifecycle.py        │
                                          │  Flutter SDK (pub get, build web, run)│
                                          └──────────────────────────────────────┘
```

- **Auth:** email + password (PBKDF2). Sessions are opaque bearer tokens stored
  hashed server-side. Every project route enforces ownership → 403.
- **Projects:** metadata in SQLite (`users`/`sessions`/`projects`); files on disk
  under `workspaces/<owner_id>/<pid>/` (structural ownership).
- **Build:** `flutter pub get` → `flutter build web --release`, streamed as SSE
  with a single `__EXIT__` sentinel, per-project lock + global concurrency cap.
- **Preview:** release builds served from `/preview/{pid}` behind a short-lived
  signed token; dev hot-reload served from a **direct per-project origin**
  (`http://<host>:<port>/`, ports 8100-8131) because Flutter's debug tooling
  needs its own origin for the hot-reload WebSocket.
- **AI:** multi-agent Gemini pipeline normalized to validated `{path, content}`
  files that are applied to your project; a deterministic fallback guarantees a
  runnable app even without a `GEMINI_API_KEY`.

See `docs/ARCHITECTURE.md` for the component breakdown and `docs/API.md` for the
full endpoint reference.

---

## 2. Prerequisites

- **Docker** (easiest), or:
- **Python 3.12+** / **pip**
- **Node.js 20+** / **npm**
- **Flutter SDK** (stable) on `PATH`
- *(optional)* **GEMINI_API_KEY** for the AI pipeline (it falls back to a
  deterministic scaffold without one)
- **FCB_SECRET** must be set in production (signs session/preview tokens)

## 3. Running

### Option A — Docker Compose

```bash
export FCB_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

# Dev: hot reload
docker compose --profile dev up --build     # frontend → :3000, backend → :5000

# Prod: slim standalone
docker compose --profile prod up --build    # frontend → :3001, backend → :5000
```

The backend requires `FCB_SECRET` (see `docker-compose.yaml`). Only the backend
runs without a profile (`docker compose up`). Set `GEMINI_API_KEY` to enable AI.

### Option B — Run manually

```bash
# Backend
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
export FCB_SECRET=dev-secret-change-me
uvicorn server:app --host 0.0.0.0 --port 5000     # or: python server.py

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                                       # → http://localhost:3000
# point at a remote backend: NEXT_PUBLIC_API_URL=http://<host>:5000 npm run dev
```

First-run: register an account → create a project (scaffolds a real Flutter app,
~30-120 s) → edit `lib/main.dart` → **Build**. Hot-reload dev mode auto-starts
on project select.

## 4. Configuration

| Variable                 | Service  | Purpose                                        | Default |
| ------------------------ | -------- | ---------------------------------------------- | ------- |
| `FCB_SECRET`             | Backend  | session/preview-token signing (required)       | —       |
| `FCB_ALLOWED_ORIGINS`    | Backend  | CORS allowlist (comma-separated)               | `http://localhost:3000,http://localhost:3001` |
| `FCB_DB_PATH`            | Backend  | SQLite metadata store                          | `backend/var/app.db` |
| `FCB_WORKSPACES_ROOT`    | Backend  | project file root                              | `backend/workspaces` |
| `GEMINI_API_KEY`         | Backend  | AI pipeline (optional)                         | —       |
| `LANGCHAIN_API_KEY`      | Backend  | LangSmith tracing (optional)                   | —       |
| `FCB_MAX_*` / rate-limit | Backend  | quotas/limits (see `backend/.env.example`)     | —       |
| `NEXT_PUBLIC_API_URL`    | Frontend | Backend base URL (inlined at build)            | `http://localhost:5000` |

Copy `backend/.env.example` and `frontend/.env.example` for a full annotated
list. Secrets are never committed and never passed to build subprocesses.

## 5. Security notes

- Path validation on every file route (`^[A-Za-z0-9_\-./]+$`, no `..`, no
  absolute); preview serving is confined to the build dir.
- AI output and user `pub` dependencies are **untrusted**: builds run with a
  secret-free allowlist environment, CPU/AS rlimits, timeouts, and (in prod)
  container resource limits. See `docs/CONTRACTS.md` W2.
- Preview/dev URLs carry signed tokens minted only inside authenticated calls.
- Rate limits gate auth + project creation; quotas cap projects/dev-servers per
  user; a GC loop purges expired sessions and orphaned project dirs.

## 6. Testing

```bash
# Backend (fast unit/contract tests; integration needs flutter on PATH)
cd backend && python -m pytest

# Frontend
cd frontend && npx tsc --noEmit && npm run lint && npm run build

# Money-path E2E (needs running backend + frontend)
cd frontend && npx playwright test
```

CI (`.github/workflows/ci.yml`) runs lint/typecheck/unit tests/security scans on
every PR; `.github/workflows/e2e.yml` runs the money-path E2E on master.

## 7. Directory layout

```
appdev_ai/
├── backend/
│   ├── server.py            # FastAPI app assembly + lifespan
│   ├── config.py            # env-driven config
│   ├── db.py                # SQLite metadata repository (users/sessions/projects)
│   ├── workspace.py         # project dirs + file I/O + path validation
│   ├── security.py          # password hashing + session tokens
│   ├── preview_token.py     # signed preview/dev access tokens
│   ├── envpolicy.py         # secret-free subprocess env allowlist
│   ├── ratelimit.py         # sliding-window limiter
│   ├── lifecycle.py         # GC loop
│   ├── metrics.py           # JSON access logs + counters
│   ├── ai_pipeline.py       # validated AI file-apply + fallback
│   ├── models/              # User / Project dataclasses
│   ├── routers/             # APIRouter per domain (+deps, _common)
│   ├── ai_agents/           # Gemini multi-agent chain
│   ├── templates/blank/     # seed for each new project
│   ├── tests/               # pytest suites
│   └── requirements*.txt
├── frontend/
│   ├── src/                 # app/, components/, context/, lib/, types/
│   └── e2e/                 # Playwright money-path tests
├── docs/                    # ARCHITECTURE, API, CONTRACTS, TESTING, plans
├── docker-compose.yaml
└── README.md
```

## 8. Further reading

- [docs/CONTRACTS.md](docs/CONTRACTS.md) — frozen v1 API/data contracts
- [docs/API.md](docs/API.md) — full endpoint reference
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — component breakdown
- [docs/V1_RELEASE_PLAN.md](docs/V1_RELEASE_PLAN.md) — what "good" means for v1
- [docs/V1_AGENT_IMPLEMENTATION_PLAN.md](docs/V1_AGENT_IMPLEMENTATION_PLAN.md) — agent decomposition
- [issues.md](issues.md) — the original 20-issue code review (fixed)
