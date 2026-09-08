# Flutter Cloud Builder (DexiForge)

Build Flutter apps in the browser with a Monaco-powered IDE and live web preview.

A monorepo with two services:

| Service  | Path       | Tech                              | Port |
| -------- | ---------- | --------------------------------- | ---- |
| Frontend | `frontend/` | Next.js 16 (App Router) + React 19 + Tailwind 4 | 3000 |
| Backend  | `backend/`  | FastAPI + Flutter SDK             | 5000 |

The backend provisions isolated Flutter workspaces from a template, serves their
file trees, edits files over HTTP, and compiles them to web (`flutter build web`).
Built previews are served behind a corrected `<base href>` so the Flutter app
routes correctly.

## Quick start

### With Docker (as configured in `docker-compose.yaml`)

```bash
docker compose up --build
# frontend → http://localhost:3000
# backend  → http://localhost:5000
```

### Without Docker

Prerequisites: Python 3.11+, Node 20+, Flutter SDK on `PATH`.

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 5000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

> Both entrypoints work: `python server.py` and `uvicorn server:app` — `server.py`
> ships a `__main__` block that runs uvicorn on port 5000.

## Repository layout

```
appdev_ai/
├── backend/
│   ├── server.py            # FastAPI app: workspaces, files, build SSE, preview, /api/ai/generate
│   ├── workspace.py         # Flutter workspace provisioning & file operations
│   ├── gemini_config.py     # Gemini + LangChain model config (AI pipeline)
│   ├── ai_agents/           # Multi-agent design pipeline (wired via /api/ai/generate)
│   ├── templates/blank/     # Flutter template copied into every new workspace
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router (page, layout, globals.css)
│       ├── components/      # IDE, MonacoEditor, FileExplorer, PreviewPane, Navbar, ...
│       ├── context/         # BuildContext (workspace bootstrap, build state, save, preview)
│       ├── lib/             # api.ts — env-driven API base URL (NEXT_PUBLIC_API_URL)
│       └── types/           # Shared TS types
├── docker-compose.yaml
└── docs/                    # This documentation
```

## Configuration

- **Frontend → backend URL**: `NEXT_PUBLIC_API_URL` (default `http://localhost:5000`).
  Set in `docker-compose.yaml`; read once in `frontend/src/lib/api.ts`.
- **Backend**: requires the Flutter SDK on `PATH` and `GEMINI_API_KEY` in
  `backend/.env` (the latter only for the optional AI endpoint).

## Documentation

- [Architecture](ARCHITECTURE.md) — component breakdown, data flow, build pipeline
- [API Reference](API.md) — all backend endpoints
- [Testing Notes](TESTING.md) — verified behavior from the latest test run

## Status

All 20 issues from the code review in [`issues.md`](../issues.md) are fixed:
backend boots under Docker with the Flutter SDK and uvicorn, the `/preview`
path-traversal is closed, the frontend talks to the backend through one env-driven
API base, edits persist to the backend, the build SSE stream reports a single
final result, and the repo is cleaned of committed build caches and dead files.
