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
│  BuildContext            │        │   ├─ list_tree/read/write│
│  (bootstrap + build SSE) │        │   └─ ensure_workspace    │
└──────────────────────────┘        │                          │
                                    │  server.py               │
                                    │   ├─ /api/workspaces     │
                                    │   ├─ /api/ai/generate    │
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

- **CORS**: `allow_origins=["*"]`, `allow_credentials=False` (the app uses no
  cookies, so the wildcard is spec-valid and cross-origin readers gain nothing).
- **`POST /api/workspaces`** → creates a workspace via `workspace.new_workspace()`.
  Bounded by a 120s timeout; failures return a clean 500 and the partial
  directory is removed.
- **`GET /api/workspaces/{wid}`** → recursive file tree (hidden and `build/`
  entries excluded).
- **`GET/PUT /api/workspaces/{wid}/file`** → read/write a single file with path
  validation (`workspace._validate_relpath`).
- **`POST /api/workspaces/{wid}/build`** → validates the workspace, cleans
  `build/web`, then returns `{ logs, preview }` URLs. **Does not build.** The
  build runs when the SSE stream below is opened.
- **`GET /api/workspaces/{wid}/build/logs`** → SSE stream that runs
  `flutter pub get`, then (only on success) `flutter build web --release
  --pwa-strategy=none`, under a per-workspace `asyncio.Lock`. Each line is
  emitted as `data: <line>` and a **single** `data: __EXIT__ <code>` sentinel is
  emitted at the end of the whole pipeline, so the client can treat it as
  completion.
- **`GET /preview/{wid}/build/web/{path:path}`** → serves the built Flutter web
  app. For `index.html`, injects `<base href="/preview/{wid}/build/web/">` so
  Flutter's asset paths resolve. `path` is resolved and confined to the build
  directory with `Path.resolve().is_relative_to()`.
- **`POST /api/ai/generate`** → lazy-imports the AI pipeline and runs
  `CoordinatorAgent.generate_design(prompt)`. Returns 503 if the pipeline can't
  be imported (no key / optional deps missing), so the server never crashes on
  startup without them.
- Every `wid` endpoint validates against `^[a-f0-9]{8}$` before touching the
  filesystem (400 for malformed, 404 for missing).

### `workspace.py` — workspace provisioning

- `ROOT / "workspaces" / <wid>` holds each project. `.gitignore`d.
- `new_workspace()` checks `flutter` is on `PATH`, copies `templates/blank/`
  (a pre-made Flutter app), creates `assets/`, then runs
  `flutter create . --platforms web` with a 120s timeout; any failure removes the
  partial workspace.
- `_validate_wid` enforces `^[a-f0-9]{8}$`.
- `_validate_relpath` enforces `^[A-Za-z0-9_\-./]+$`, rejects absolute paths and
  `..` segments.
- `write_file` flushes and `os.fsync`s before returning.
- `list_tree` walks recursively but skips dot-entries (`.dart_tool`, `.git`,
  `.pub-cache`) and `build/`.

### `templates/blank/`

A minimal Flutter web app (`lib/main.dart`). No machine-specific artifacts are
committed — `.dart_tool/` and `pubspec.lock` were removed from the template and
gitignored; `flutter pub get` / `flutter create` regenerate them per workspace.

### `ai_agents/` + `gemini_config.py` — AI design pipeline

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
models, optional LangSmith tracing). Requires `GEMINI_API_KEY` in `backend/.env`
and the AI deps in `requirements.txt`. It is exposed through `POST
/api/ai/generate`, imported lazily so the core server runs without it.

## Frontend

### `src/app/` — App Router

- `layout.tsx` wraps everything in `ChatWorkspaceLayout` (sidebar + Navbar + content).
- `page.tsx` renders `IDE`, a build-logs/status terminal, the AI prompt bar, and
  `PreviewPane`. `previewVisible` comes from `BuildContext`, so the Navbar
  toggle and the pane stay in sync.

### `src/lib/api.ts`

Single env-driven base URL: `NEXT_PUBLIC_API_URL || "http://localhost:5000"`.
Every fetch in the app goes through `API_BASE`.

### `src/context/BuildContext.tsx`

Central app state: `workspaceId`, `previewVisible`, `isBuilding`, `logs`,
`error`, `previewUrl`, `saveSignal`. On mount it `bootstrap()`s a workspace —
reuses the id in `sessionStorage` or `POST /api/workspaces` to create one.
`triggerBuild()` POSTs to `/build`, opens the SSE stream, and on the single
`__EXIT__ 0` sets `previewUrl`; `requestSave()` signals the IDE to persist the
active file.

### `src/components/`

- **`WorkspaceLayout.tsx`** — chrome: collapsible sidebar, Projects/Workspace
  views, Navbar. Wraps children in `BuildProvider`.
- **`Navbar.tsx`** — Save / Build / Preview buttons, driven entirely from
  `BuildContext` (`requestSave`, `triggerBuild`, `togglePreview`).
- **`IDE.tsx`** — loads the nested tree from `GET /api/workspaces/{wid}`, tabbed
  editor, `MonacoEditor`, file save with debounced autosave, and listens for the
  Navbar's save signal. Shows a real save-state indicator.
- **`CodeEditor.tsx`** — wraps `@monaco-editor/react` `<Editor>`; Cmd/Ctrl+S
  triggers `onSave`.
- **`FileExplorer.tsx`** — recursive tree node; checks `node.type === "dir"`.
- **`PreviewPane.tsx`** — device frames (iPhone/Pixel/iPad/Desktop); iframe
  `src` is the `previewUrl` from context (`API_BASE + /preview/{wid}/...`) with
  `sandbox="allow-scripts"` only, since the built Flutter app is untrusted.

### `src/types/file.ts`

`FileNode { id, path, name, type: "file" | "dir", children? }` — `path` matches
what the components and the backend tree use.

## Docker (`docker-compose.yaml`)

- `frontend`: `node:20-bullseye`, `npm run dev`, port 3000, bind-mounted
  `./frontend`, `NEXT_PUBLIC_API_URL=http://localhost:5000`.
- `backend`: `ghcr.io/cirruslabs/flutter:stable` (Flutter + Dart on `PATH`) with
  python3/pip installed, `CMD ["uvicorn", "server:app", "--host", "0.0.0.0",
  "--port", "5000"]`, port 5000, bind-mounted `./backend`.
- The obsolete top-level `version:` key could be dropped (harmless).
