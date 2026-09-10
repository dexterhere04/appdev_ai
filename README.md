# Flutter Cloud Builder
<img width="1871" height="986" alt="image" src="https://github.com/user-attachments/assets/025eb4c8-e383-4032-ba40-4c9b5c031b0a" />

An in-browser IDE for building Flutter web apps. You edit Dart/Flutter code in a
Monaco-based editor, save it to an isolated backend workspace, compile it with the
Flutter SDK, and preview the result live in a device frame — with an optional
multi-agent AI pipeline that turns a text prompt into a Flutter app design.

Two services, one repo:

| Service  | Path        | Tech                                          | Port |
| -------- | ----------- | --------------------------------------------- | ---- |
| Frontend | `frontend/` | Next.js 16 (App Router) + React 19 + Tailwind 4 | 3000 |
| Backend  | `backend/`  | FastAPI (uvicorn) + Flutter SDK               | 5000 |

---

## 1. High-level architecture

```
 Browser (3000)                          Backend (5000)
 ┌────────────────────────────┐          ┌─────────────────────────────────────┐
 │ Next.js app                │  HTTP    │ FastAPI (server.py)                 │
 │  ├─ IDE (Monaco)           │─────────►│  ├─ /api/workspaces …               │
 │  ├─ FileExplorer           │          │  ├─ /api/workspaces/{wid}/file      │
 │  ├─ PreviewPane (iframe)   │◄─────────│  ├─ /api/workspaces/{wid}/build/logs│
 │  └─ BuildContext           │   SSE    │  ├─ /preview/{wid}/build/web/…      │
 │     (state + build stream) │          │  └─ /api/ai/generate                │
 └────────────────────────────┘          │                                     │
                                         │  workspace.py                       │
                                         │   ├─ new_workspace()  (flutter create)
                                         │   ├─ list_tree/read/write          │
                                         │   └─ ensure_workspace               │
                                         │                                     │
                                         │  Flutter SDK (pub get, build web)  │
                                         └─────────────────────────────────────┘
```

The backend provisions an isolated Flutter workspace per user session (a copy of a
blank template), serves its file tree and file contents over HTTP, persists edits,
compiles the workspace to a static web build, and serves that build for preview.

---

## 2. Low-level design

### 2.1 Backend (`backend/`)

**`server.py` — FastAPI application**

- CORS: `allow_origins=["*"]`, `allow_credentials=False` (no cookies are used).
- `wid` (workspace id) is an 8-char lowercase hex string; every endpoint validates
  it against `^[a-f0-9]{8}$` before touching the filesystem.
- Runs under `uvicorn` (there is a `if __name__ == "__main__": uvicorn.run(...)`
  block, so `python server.py` also works).

**`workspace.py` — workspace provisioning & file I/O**

- Workspaces live under `backend/workspaces/<wid>/` (gitignored).
- `new_workspace()`: copies `templates/blank/`, creates `assets/`, then runs
  `flutter create . --platforms web` with a 120s timeout. On any failure the
  partial directory is removed and a clean error is returned.
- `list_tree()`: recursive walk, skipping hidden entries (`.dart_tool`, `.git`,
  `.pub-cache`) and `build/`.
- `read_file()` / `write_file()`: validate the relative path
  (`^[A-Za-z0-9_\-./]+$`, no `..`, no absolute path); writes are `fsync`ed.

**`gemini_config.py` + `ai_agents/` — optional AI pipeline**

- A LangChain multi-agent chain: `CoordinatorAgent` orchestrates
  `CreativeDirector` → `UXArchitect` → `UIDesigner` → `Critic` → `Codewriter` →
  `Stylist`.
- `gemini_config.py` auto-selects Gemini models per role and configures optional
  LangSmith tracing. Requires `GEMINI_API_KEY` in `backend/.env`.
- The pipeline is imported **lazily** inside `POST /api/ai/generate`; if the key
  or the AI deps are missing the endpoint returns `503` and the core server still
  starts.

**`templates/blank/` — new-workspace seed**

A minimal Flutter web app (`lib/main.dart` shows "Hello from your Flutter
Workspace!"). No machine-specific artifacts are committed — `.dart_tool/` and
`pubspec.lock` are gitignored and regenerated per workspace.

### 2.2 API contract

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST   | `/api/workspaces`                         | Create a workspace → `{ workspaceId }` |
| GET    | `/api/workspaces/{wid}`                    | Recursive file tree → `{ files: [...] }` |
| GET    | `/api/workspaces/{wid}/file?path=…`        | Read a file → `{ path, content }` |
| PUT    | `/api/workspaces/{wid}/file`               | Write a file (body `{ path, content }`) → `{ ok: true }` |
| POST   | `/api/workspaces/{wid}/build`              | Clean `build/web`, return `{ logs, preview }` |
| GET    | `/api/workspaces/{wid}/build/logs`         | SSE stream; runs `pub get` → `build web` |
| GET    | `/preview/{wid}/build/web/{path}`          | Serve built web assets (base-href rewritten) |
| POST   | `/api/ai/generate`                         | Run AI pipeline (body `{ prompt }`) → `{ result }` |

Error handling: `400` malformed `wid`/path, `404` missing workspace/file, `500`
workspace creation failure, `503` AI unavailable, `502` AI generation failure.

### 2.3 Frontend (`frontend/`)

**`src/lib/api.ts`** — single env-driven base URL:
`NEXT_PUBLIC_API_URL || "http://localhost:5000"`.

**`src/context/BuildContext.tsx`** — central app state (React context):
`workspaceId`, `previewVisible`, `isBuilding`, `logs`, `error`, `previewUrl`,
`saveSignal`, plus actions `bootstrap`, `triggerBuild`, `requestSave`,
`togglePreview`. On mount it reuses the id in `sessionStorage` or creates a new
workspace.

**`src/components/`**

- `WorkspaceLayout.tsx` — app chrome (collapsible sidebar, Projects/Workspace
  views, Navbar); wraps children in `BuildProvider`.
- `Navbar.tsx` — Save / Build / Preview buttons, driven from `BuildContext`.
- `IDE.tsx` — loads the nested tree, tabbed editor, file save (debounced
  autosave + Navbar save signal), save-state indicator.
- `CodeEditor.tsx` — wraps `@monaco-editor/react`; Cmd/Ctrl+S triggers `onSave`.
- `FileExplorer.tsx` — recursive tree (`type === "dir"` renders folders).
- `PreviewPane.tsx` — device frames (iPhone / Pixel / iPad / Desktop); iframe
  `src` is the build preview URL with `sandbox="allow-scripts"` only.
- `Logo.tsx` — brand mark.

**`src/app/`** — App Router: `layout.tsx` (global shell), `page.tsx` (IDE +
build terminal + AI prompt bar + preview pane), `globals.css`.

**`src/types/file.ts`** — `FileNode { id, path, name, type: "file" | "dir",
children? }`.

---

## 3. How it runs (end-to-end)

**Workspace bootstrap.** On first load the frontend checks `sessionStorage` for a
`workspaceId`; if absent it `POST /api/workspaces`. The backend copies the blank
template and runs `flutter create`, returning a fresh `workspaceId`, which is
cached in `sessionStorage`.

**Browsing & editing.** The IDE `GET`s the recursive tree and renders it in the
explorer. Clicking a file `GET`s its contents into a Monaco tab. Edits update
local state and are persisted via `PUT /api/workspaces/{wid}/file` — triggered by
Cmd/Ctrl+S, the Navbar Save button, or a 1.5s debounced autosave. A save-state
indicator reflects `idle`/`saving`/`saved`/`error`.

**Building.** The Navbar Build button calls `triggerBuild()`:
1. `POST /api/workspaces/{wid}/build` → cleans `build/web`, returns
   `{ logs, preview }`.
2. The client opens an `EventSource` on `/api/workspaces/{wid}/build/logs`.
3. The backend runs `flutter pub get`, then (only on success)
   `flutter build web --release --pwa-strategy=none`, streaming each output line
   as an SSE `data:` event under a per-workspace lock.
4. A single `data: __EXIT__ <code>` sentinel is emitted at the very end; exit
   code `0` sets the preview URL, anything else surfaces an error in the terminal.

**Previewing.** On success, `previewUrl = API_BASE + preview`. The `PreviewPane`
iframe loads `/preview/{wid}/build/web/`, whose `index.html` gets a corrected
`<base href>` injected server-side so Flutter's assets resolve. The preview pane
is toggled by the Navbar (state lives in `BuildContext`).

**AI (optional).** The prompt bar `POST /api/ai/generate`; the backend
lazy-imports the multi-agent pipeline and returns its design JSON. Without a
`GEMINI_API_KEY` or the AI dependencies it degrades to a `503` "AI unavailable"
message rather than crashing.

---

## 4. Prerequisites

- **Docker** (easiest), or:
- **Python 3.11+** and **pip**
- **Node.js 20+** and **npm**
- **Flutter SDK** (stable) on `PATH`
- *(optional)* **GEMINI_API_KEY** in `backend/.env` for the AI feature

---

## 5. Running

### Option A — Docker Compose

Compose starts the shared `backend` always. Two profiles pick the frontend:
`dev` (hot reload, bind mount) and `prod` (optimized standalone build).

**Dev (hot reload):**

```bash
docker compose --profile dev up --build
# frontend → http://localhost:3000   (next dev, bind-mounted source)
# backend  → http://localhost:5000
```

**Prod (slim standalone runtime):**

```bash
docker compose --profile prod up --build
# frontend → http://localhost:3001   (next start standalone, no bind mount)
# backend  → http://localhost:5000
```

> Only the backend runs without a profile (`docker compose up` starts just the
> API on :5000). The `frontend-prod` image is built with
> `NEXT_PUBLIC_API_URL` as a build arg because Next inlines it at `next build`.
> Manual image builds: `docker build --target dev ./frontend` or
> `docker build ./frontend` (prod). `.dockerignore` keeps build contexts tiny
> (`frontend/` ≈ a few kB instead of ~776 MB of node_modules).

### Option B — Run manually

**Backend**

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 5000     # or: python server.py
```

**Frontend** (separate terminal)

```bash
cd frontend
npm install
npm run dev                                       # → http://localhost:3000
```

> Point the frontend at a different backend with
> `NEXT_PUBLIC_API_URL=http://<host>:5000 npm run dev`.

---

## 6. Configuration

| Variable             | Service  | Purpose                                    | Default |
| -------------------- | -------- | ------------------------------------------ | ------- |
| `NEXT_PUBLIC_API_URL`| Frontend | Backend base URL                           | `http://localhost:5000` |
| `GEMINI_API_KEY`     | Backend  | Gemini key for the AI pipeline (optional)  | —       |
| `LANGCHAIN_API_KEY`  | Backend  | LangSmith tracing (optional)               | —       |

---

## 7. Directory layout

```
appdev_ai/
├── backend/
│   ├── server.py            # FastAPI routes, SSE build stream, AI endpoint
│   ├── workspace.py         # workspace provisioning + file I/O + path validation
│   ├── gemini_config.py     # Gemini/LangChain model config
│   ├── ai_agents/           # multi-agent design pipeline
│   ├── templates/blank/     # seed for each new workspace
│   ├── requirements.txt
│   ├── Dockerfile            # venv + uvicorn on ghcr.io/cirruslabs/flutter:3.41.5
│   └── .dockerignore
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   ├── components/      # IDE, CodeEditor, FileExplorer, Navbar, PreviewPane, …
│   │   ├── context/         # BuildContext (state + build SSE)
│   │   ├── lib/             # api.ts (env-driven base URL)
│   │   └── types/           # FileNode
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile            # multi-stage: dev (hot reload) / prod (standalone)
│   └── .dockerignore
├── docs/                    # API.md, ARCHITECTURE.md, TESTING.md, README.md
├── docker-compose.yaml
└── README.md
```

---

## 8. Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — component breakdown & data flow
- [docs/API.md](docs/API.md) — full endpoint reference
- [docs/TESTING.md](docs/TESTING.md) — verified behavior from the latest test run
- [issues.md](issues.md) — code review with the 20 issues (all now fixed)
