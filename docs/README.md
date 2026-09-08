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

> **Note:** the backend must be started with `uvicorn`, not `python server.py`.
> `server.py` defines the FastAPI `app` but has no `__main__` entrypoint, so
> `python server.py` exits immediately (see `issues.md` #1).

## Repository layout

```
appdev_ai/
├── backend/
│   ├── server.py            # FastAPI app: workspaces, files, build SSE, preview
│   ├── workspace.py         # Flutter workspace provisioning & file operations
│   ├── gemini_config.py     # Gemini + LangChain model config (AI pipeline)
│   ├── ai_agents/           # Multi-agent design pipeline (not wired to server)
│   ├── templates/blank/     # Flutter template copied into every new workspace
│   ├── testing1.py          # Standalone AI pipeline smoke test
│   ├── testing2.py          # Full AI workflow demo (writes output/app_design_output.json)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router (page, layout, globals.css)
│       ├── components/      # IDE, MonacoEditor, FileExplorer, PreviewPane, Navbar, ...
│       ├── context/         # BuildContext (build state + SSE log stream)
│       └── types/           # Shared TS types
├── docker-compose.yaml
└── docs/                    # This documentation
```

## Documentation

- [Architecture](ARCHITECTURE.md) — component breakdown, data flow, build pipeline
- [API Reference](API.md) — all backend endpoints
- [Testing Notes](TESTING.md) — verified behavior from the latest test run

## Known issues

See [`issues.md`](../issues.md) for a full code review (20 issues: backend won't
start under `python server.py` in Docker, path-traversal risk on `/preview`,
frontend↔backend API contract mismatches, no save path, and more).
