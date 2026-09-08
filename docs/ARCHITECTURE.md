# Architecture

## High-level flow

```
┌──────────────────────────┐        ┌──────────────────────────┐
│       Frontend (3000)    │  HTTP  │        Backend (5000)    │
│  Next.js 16 / React 19   │◄──────►│        FastAPI           │
│                          │        │                          │
│  IDE (Monaco)            │        │  workspace.py            │
│  FileExplorer            │        │   ├─ new_workspace()     │
│  PreviewPane (iframe)    │        │   │   (flutter create)   │
│  BuildContext (SSE)      │        │   ├─ list_tree/read/write│
└──────────────────────────┘        │   └─ ensure_workspace    │
                                    │                          │
                                    │  server.py               │
                                    │   ├─ /api/workspaces     │
                                    │   ├─ /api/.../build (SSE)│
                                    │   └─ /preview/{wid}/...  │
                                    │        │                 │
                                    │        ▼                 │
                                    │   Flutter SDK            │
                                    │   (pub get, build web)   │
                                    └──────────────────────────┘
```

## Backend

### `server.py` — FastAPI application

- **CORS**: `allow_origins=["*"]` with `allow_credentials=True` (invalid combo —
  see `issues.md` #8).
- **`POST /api/workspaces`** → creates a workspace via `workspace.new_workspace()`
  (sync, blocking `flutter create`, no timeout — `issues.md` #13).
- **`GET /api/workspaces/{wid}`** → recursive file tree.
- **`GET/PUT /api/workspaces/{wid}/file`** → read/write a single file with path
  validation (`workspace._validate_relpath`).
- **`POST /api/workspaces/{wid}/build`** → cleans `build/web`, then returns
  `{ logs, preview }` URLs. **Does not build.** The build is actually triggered
  when the frontend opens the SSE stream below.
- **`GET /api/workspaces/{wid}/build/logs`** → SSE stream that runs
  `flutter pub get` then `flutter build web --release --pwa-strategy=none`,
  emitting each line as `data: <line>` and one `data: __EXIT__ <code>` after
  *each* subprocess. The client treats the first `__EXIT__` as completion —
  which fires after `pub get`, before the real build (see `issues.md` #7).
- **`GET /preview/{wid}/build/web/{path:path}`** → serves the built Flutter web
  app. For `index.html`, injects `<base href="/preview/{wid}/build/web/">` so
  Flutter's asset paths resolve. The `path` segment is **not** validated against
  the build directory — relies on the ASGI server normalizing `..`
  (see `issues.md` #2).

### `workspace.py` — workspace provisioning

- `ROOT / "workspaces" / <wid>` holds each project. `.gitignore`d.
- `new_workspace()` copies `templates/blank/` (a pre-made Flutter app), creates
  `assets/`, then runs `flutter create . --platforms web` in place.
- `_validate_relpath` enforces `^[A-Za-z0-9_\-./]+$`, rejects absolute paths and
  `..` segments.
- `write_file` flushes and `os.fsync`s before returning.

### `templates/blank/`

A minimal Flutter web app (`lib/main.dart` shows "Hello from your Flutter
Workspace!"). Ships a `.dart_tool/package_config.json` and `pubspec.lock` that
contain **absolute machine-specific paths** — these get copied into every new
workspace (see `issues.md` #14).

### `ai_agents/` + `gemini_config.py` — AI design pipeline (not wired to server)

A LangChain multi-agent pipeline that turns a text prompt into a Flutter app
design (vision → UX → UI → critique → code → style):

| Agent                 | File                   | Model role   |
| --------------------- | ---------------------- | ------------ |
| CreativeDirectorAgent | `creative_director.py` | `planner`    |
| UXArchitectAgent      | `ux_architect.py`      | `planner`    |
| UIDesignerAgent       | `ui_designer.py`       | `codewriter` |
| CriticAgent           | `critic.py`            | `reviewer`   |
| CodewriterAgent       | `codewriter.py`        | `codewriter` |
| StylistAgent          | `stylist.py`           | `stylist`    |
| CoordinatorAgent      | `coordinator.py`       | orchestrates |

Model selection happens in `gemini_config.py` (auto-picks available Gemini
models, optional LangSmith tracing). Requires `GEMINI_API_KEY` in `backend/.env`.

> This pipeline is **not imported by `server.py`** (the imports are commented
> out). It runs only via `testing1.py` / `testing2.py`. The `/api/ai/generate`
> endpoint is also commented out (see `issues.md` #10).

## Frontend

### `src/app/` — App Router

- `layout.tsx` wraps everything in `ChatWorkspaceLayout` (sidebar + Navbar + content).
- `page.tsx` renders `IDE` + the AI prompt bar + `PreviewPane` with its **own**
  `previewVisible` state (independent of the sidebar's — see `issues.md` #9).

### `src/components/`

- **`WorkspaceLayout.tsx`** — chrome: collapsible sidebar, Projects/Workspace
  views, AI Responses panel (dead chat state), Navbar. Hardcodes
  `workspaceId="my-flutter-app"`.
- **`Navbar.tsx`** — Save / Build / Preview buttons + icons. Build calls
  `triggerBuild()` from context. Save is a `console.log` (no persistence —
  `issues.md` #4). `onBuild` prop is dropped.
- **`IDE.tsx`** — file tree loading, tabbed editor, Monaco integration. Reads
  `API_BASE = "http://13.235.89.215:5051"` and calls `/api/tree` + `/api/file` —
  **these endpoints don't exist on the backend** (see `issues.md` #3).
- **`CodeEditor.tsx`** — loads Monaco from the cdnjs CDN at runtime; Ctrl/Cmd+S
  wired to an optional `onSave` that `IDE` never passes.
- **`FileExplorer.tsx`** — recursive tree node; checks `node.type === "dir"`.
- **`PreviewPane.tsx`** — device frames (iPhone/Pixel/iPad/Desktop) with an
  iframe pointed at a hardcoded remote URL (`http://13.235.89.215:3000`).

### `src/context/BuildContext.tsx`

Holds `workspaceId`, `isBuilding`, `logs`, `error` and `triggerBuild()`.
`triggerBuild` POSTs to `http://localhost:8000/api/workspaces/{wid}/build`
(port 8000 — nothing runs there; backend is 5000) and opens an `EventSource`
that closes on the first `__EXIT__` event (see `issues.md` #3/#7). The logs are
never rendered in the UI.

### `src/types/file.ts`

`FileNode { id, name, type, children? }` — missing `path`, which the components
use everywhere. `next build` fails to typecheck for this reason
(see `issues.md` #5).

## Docker (`docker-compose.yaml`)

- `frontend`: `node:20-bullseye`, `npm run dev`, port 3000, bind-mounted `./frontend`.
- `backend`: `python:3.11-slim`, `python3 server.py`, port 5000, bind-mounted
  `./backend`.
- **Broken**: the backend container runs `python3 server.py`, which exits
  immediately (no `uvicorn.run`), and the image has no Flutter SDK, so builds
  would fail anyway (see `issues.md` #1).
