# Code Review — Flutter Cloud Builder

Review of the full repo (backend, backend/ai_agents, frontend/src, configs, docker-compose, templates, .gitignore). Verified against actual code, git tracking, and committed artifacts. No fixes applied.

---

## Critical

### 1. Backend container never serves HTTP — no `uvicorn.run` / `__main__` block, and Flutter SDK missing from image
- `backend/Dockerfile:7` `CMD ["python", "server.py"]`; `docker-compose.yaml:20` `command: python3 server.py`.
- `backend/server.py` defines the FastAPI `app` object (line 17) but has **no** `if __name__ == "__main__"` and **no** `uvicorn.run(...)`. Running `python server.py` imports the module, registers routes, and exits 0. The backend container starts and immediately dies; nothing listens on 5000.
- Additionally, `python:3.11-slim` (`backend/Dockerfile:1`) does **not** install the Flutter SDK, yet the API shells out to `flutter create` (`workspace.py:24-28`), `flutter pub get` and `flutter build web` (`server.py:132-138`). Even if the server started, every build would fail with `flutter: command not found`.
- **Fix:** Run `uvicorn server:app --host 0.0.0.0 --port 5000` in the Dockerfile/docker-compose, and either install Flutter in the image (or use a `cirrusci/flutter`-based image) and confirm `flutter` is on `PATH`.

### 2. Arbitrary file read via path traversal in `/preview/...`
- `backend/server.py:27-47` — `@app.get("/preview/{wid}/build/web/{path:path}")` builds `file_path = base / "build" / "web" / path` with **no** normalization or realm check on `path`. `path` is user-controlled and the `{path:path}` converter allows `/` and `..`.
- Example: `/preview/<wid>/build/web/../../../server.py` resolves outside the build dir to `backend/server.py`; `/preview/<wid>/build/web/../../../../etc/passwd` reads arbitrary system files. The only gate is `file_path.exists()` (`server.py:32`), which the attacker controls by choosing a real file.
- This exposes all files readable by the server process, including `backend/.env` (ignored by git but present at runtime and containing `GEMINI_API_KEY`).
- **Fix:** Resolve the path and verify `file_path.resolve().is_relative_to((base / "build" / "web").resolve())` before serving; reject with 404/400 otherwise. Also validate `wid` (currently `ensure_workspace` at `server.py:29`/`workspace.py:92-95` accepts arbitrary wid strings like `../..`).

### 3. Frontend↔backend API contract is completely mismatched — the app is a no-op against the real backend
- `frontend/src/components/IDE.tsx:9` hardcodes `API_BASE = "http://13.235.89.215:5051"` (a remote IP that matches nothing in this repo; docker maps backend to port 5000, docker-compose.yaml:17).
- IDE calls `GET ${API_BASE}/api/tree` (`IDE.tsx:71`) and `GET ${API_BASE}/api/file?path=...` (`IDE.tsx:100-102`), but the backend only exposes `GET /api/workspaces/{wid}` for the tree (`server.py:58`) and `GET /api/workspaces/{wid}/file` (`server.py:65`). These paths 404.
- `BuildContext.tsx:34` and `:40` use `http://localhost:8000` — no service runs on 8000 (backend is on 5000 per compose/Dockerfile; IDE expects 5051). Build requests fail.
- `PreviewPane.tsx:12` hardcodes `REMOTE_PREVIEW_URL = "http://13.235.89.215:3000"` — the frontend's own origin — so the preview iframe embeds the Next.js app (infinite nesting), never the built Flutter app.
- **Fix:** Use one env-driven base URL (wire `NEXT_PUBLIC_API_URL`, already set in docker-compose.yaml:11 but never read) and one API shape (`/api/workspaces/{wid}/...`), and have PreviewPane consume the preview URL returned by the build endpoint (`server.py:118`).

### 4. No save / persistence path exists — edits are never written to the backend
- IDE edits only update React state (`fileContents`, `IDE.tsx:15,118-122`). Nothing ever calls `PUT /api/workspaces/{wid}/file` (`server.py:74-82`); a grep for the PUT/save path across `frontend/src` returns nothing.
- Navbar "Save" → `onSave={() => console.log("Save action")}` (`WorkspaceLayout.tsx:229`) — a no-op.
- `MonacoEditor` supports Ctrl+S via `onSave` (`CodeEditor.tsx:32-35,71-74`) but `IDE.tsx:220-224` never passes `onSave`.
- Navbar even shows a hardcoded "Auto-saved 2m ago" (`Navbar.tsx:30`), which is false.
- **Fix:** Wire Monaco `onSave`/debounced autosave to `PUT /api/workspaces/{wid}/file` and reflect backend errors in the UI.

---

## High

### 5. `FileNode` type is missing `path` — TypeScript compile errors throughout, `next build` will fail
- `frontend/src/types/file.ts:1-6` defines only `{ id, name, type, children? }` — no `path`.
- `IDE.tsx` accesses `node.path` / `file.path` in ~13 places (`IDE.tsx:91,97,101,105,109-113,120,127,129-130,163,196,198,202,222`) and `buildTree` (`IDE.tsx:45-63`) returns object literals that omit required `id` and add excess `path`. With `strict: true` (`tsconfig.json:11`) this is a type error (missing `id` + excess `path` on every node).
- `FileExplorerItem` keys off `node.id` (`FileExplorer.tsx:51`); `buildTree` produces nodes without `id`, so keys become `"undefined-undefined"` → React duplicate-key warning and reconciliation bugs.
- **Fix:** Add `path: string` (and keep `id`) to `FileNode`, or drop `id` and key off `path`.

### 6. File tree never shows children — backend returns nested tree, frontend expects flat list
- `workspace.py:42-69` (`list_tree`) returns a **recursive** tree with `children` arrays and `type: "dir"`.
- `IDE.tsx:20-64` (`buildTree`) iterates only the top-level `data.files` array as a **flat** `{path,type}` list and ignores the backend's `children` entirely. Result: the explorer renders only root entries (`lib`, `pubspec.yaml`, …) with no expandable folders; files inside directories are unreachable.
- Even if the data were flat, `buildTree` emits `type: "folder"` for intermediates while `FileExplorer.tsx:17` checks `node.type === "dir"` — another mismatch.
- **Fix:** Use the backend's nested `children` directly (with a matching type), or flatten on the backend and rebuild in the frontend consistently (one canonical shape, one `dir` marker).

### 7. Build SSE contract is broken — false "Build complete!" and race conditions
- `POST /api/workspaces/{wid}/build` (`server.py:108-119`) only rmtree's `build/web` and returns `{logs, preview}`; it does **not** build. The actual build happens as a side effect of the frontend opening the SSE stream `GET /api/workspaces/{wid}/build/logs` (`server.py:121-142`) — the endpoint's POST/GET split is surprising and the POST is nearly useless.
- Each subprocess emits its own `data: __EXIT__ <code>` sentinel (`server.py:104-106`): first after `flutter pub get` (`server.py:131-133`), then after `flutter build web` (`server.py:136-138`). The frontend closes the EventSource on the **first** `__EXIT__` (`BuildContext.tsx:43-55`) — i.e., it reports "✅ Build complete!" when `pub get` succeeds, before `flutter build web` has even run. A real build failure is invisible, and the "Building web..." segment never reaches the client.
- If `pub get` fails (non-zero), the code proceeds to `flutter build web` anyway (`server.py:135`).
- No per-workspace build lock: two triggers (POST rmtree + SSE build) can run concurrently against the same workspace (`shutil.rmtree` at `server.py:114` races an in-flight `flutter build`) → corrupted output.
- **Fix:** Emit a single `__EXIT__` after the whole pipeline; have the POST actually start the build (or fold the SSE into it) under a per-workspace asyncio lock; make the frontend treat only the final sentinel as completion.

### 8. Invalid/insecure CORS configuration
- `backend/server.py:18-22`: `allow_origins=["*"]` **with** `allow_credentials=True`. Per the CORS spec this combination is invalid (`*` may not be combined with credentials); Starlette ends up reflecting arbitrary origins, effectively making every origin "allowed" with credentials.
- The API is unauthenticated and serves workspace file contents (plus, with issue #2, arbitrary files), so the wildcard+credentials combo removes the last barrier for cross-origin exfiltration from any website.
- **Fix:** If credentials are needed, set explicit origins; otherwise drop `allow_credentials=True` (the app uses no cookies), or `allow_origins` to the known frontend origin(s).

---

## Medium

### 9. Preview toggle button does nothing (two independent `previewVisible` states)
- `WorkspaceLayout.tsx:25` owns a `previewVisible` state toggled by the Navbar (`WorkspaceLayout.tsx:231`), which only flips the Navbar eye icon.
- The actual preview pane is rendered by `page.tsx:57-61` using **page.tsx's own** `previewVisible` (page.tsx:9), which nothing ever toggles.
- **Fix:** Lift a single `previewVisible` state to a shared parent/provider and drive both the Navbar icon and the pane from it.

### 10. AI chat UI is present but dead; AI backend is commented out
- `page.tsx:39-53` renders a chat input + Send button with no handler (`handleSend` commented at `page.tsx:19-23`) — typing does nothing.
- `WorkspaceLayout.tsx:35-48` and `:243-259` have `handleSend` and the terminal input commented out.
- `server.py:6-7` has the `gemini_config`/`ai_agents` imports commented out and `server.py:143-153` the `/api/ai/generate` endpoint commented out. The multi-agent pipeline (`ai_agents/`, `gemini_config.py`) is reachable only from standalone `testing1.py`/`testing2.py`, never from the server.
- **Fix:** Either re-enable the AI endpoint + wiring, or remove the chat UI and AI scaffolding so it isn't advertised as working.

### 11. Build state never surfaces in the UI
- `BuildContext` accumulates `logs`/`isBuilding`/`error` (`BuildContext.tsx:18-20`) but no component renders them — the terminal pane is commented out. The user can't see build progress or failure, and the `preview` URL returned by the build POST (`server.py:118`) is never consumed.
- **Fix:** Render logs near the IDE (uncomment/implement a terminal) and navigate the preview iframe to the returned preview URL on success.

### 12. `onBuild` prop is dead
- `WorkspaceLayout.tsx:230` passes `onBuild={() => {}}` to Navbar, but `Navbar.tsx:11-16` destructures only `{ workspaceId, onSave, onTogglePreview, previewVisible }` — `onBuild` is silently dropped. The Build button calls `triggerBuild()` from context (`Navbar.tsx:44`).
- **Fix:** Remove the prop or use it; also `workspaceId="my-flutter-app"` (`WorkspaceLayout.tsx:228`) is hardcoded and unrelated to any real workspace.

### 13. Workspace creation is synchronous and blocks; no error/timeout handling
- `workspace.py:24-28` runs `flutter create` via blocking `subprocess.run(..., check=True)` inside the endpoint (`server.py:53-56`). `check=True` turns any flutter failure into an unhandled 500; no timeout; `copytree` of the template precedes it (`workspace.py:18`).
- **Fix:** Run async with a timeout, return a proper error, and validate that `flutter` is installed before creating workspaces.

### 14. Committed template ships stale, machine-specific artifacts into every new workspace
- `backend/templates/blank/.dart_tool/package_config.json` (tracked in git) contains absolute paths such as `file:///home/dexter/.pub-cache/...` and `file:///home/dexter/Documents/flutter/...` (verified). `copytree` (`workspace.py:18`) copies this into each new workspace; `pubspec.lock` is also tracked and copied.
- **Fix:** Remove `.dart_tool/**` and `pubspec.lock` from the template and gitignore them; let `flutter pub get`/`flutter create` regenerate.

### 15. Preview iframe sandbox is ineffective and points at the app itself
- `PreviewPane.tsx:66` uses `sandbox="allow-scripts allow-same-origin"` — this combination effectively disables sandboxing (a same-origin sandboxed frame with scripts can undo its own restrictions). It also embeds the frontend origin (`PreviewPane.tsx:12`) rather than the built app, so it's the app loading itself.
- **Fix:** Once the preview points at the real `/preview/{wid}/build/web` (different origin), keep `allow-scripts` only (no `allow-same-origin`) since the Flutter app is untrusted third-party content.

---

## Low

### 16. Gitignore gaps — build caches and junk committed
- `.gitignore` ignores only `backend/workspaces` and `backend/.env`.
- Committed and tracked: `backend/**/__pycache__/*.pyc` (many files, confirmed via `git ls-files`), `.vscode/settings.json` (empty), `backend/templates/blank/.dart_tool/**`, `backend/templates/blank/pubspec.lock`, and a 116 KB `backend/output/app_design_output.json` artifact.
- **Fix:** Add `__pycache__/`, `*.pyc`, `.vscode/`, `backend/output/`, `backend/templates/blank/.dart_tool/`, `backend/templates/blank/pubspec.lock` to `.gitignore` and `git rm` the tracked artifacts.

### 17. Dead imports / dead files in the backend
- `server.py` duplicate `from fastapi import FastAPI, HTTPException` (lines 5 and 8); unused `Request` (line 8), `JSONResponse` (line 9), `StaticFiles` (line 11); `Response` imported twice (lines 9/14).
- `gemini_config.py` + `ai_agents/*` are only imported by `testing1.py`/`testing2.py`; `backend/output/app_design_output.json` is a leftover run artifact.
- **Fix:** Delete `testing1.py`/`testing2.py`/`output/`, drop the unused imports, and either wire the AI pipeline into the server or remove it.

### 18. Unused frontend dependencies and broken CDN Monaco
- `package.json:16` `react-arborist` and `package.json:12` `@monaco-editor/react` are never imported (only `@monaco-editor/react` appears in `tsconfig.json:25` "types").
- `CodeEditor.tsx:82-97` loads Monaco from cdnjs at runtime (`https://cdnjs.cloudflare.com/.../loader.min.js`); if the CDN is blocked/offline the editor silently never initializes (no error UI).
- **Fix:** Drop unused deps; bundle Monaco via the `@monaco-editor/react` package you already depend on, or handle load failure.

### 19. React Compiler config: dead plugin + risk with Monaco refs
- `next.config.ts:5` sets `reactCompiler: true` (fine, it's stable/on by default in Next 16), but `package.json:25` adds `babel-plugin-react-compiler@1.0.0` which Next 16's SWC-based compiler never uses — dead devDependency.
- `CodeEditor.tsx` is an imperative, ref-heavy component (`editorRef.current.onDidChangeModelContent(...)`, mutation inside a `[]` effect, `CodeEditor.tsx:41-110`). React Compiler memoization can interact badly with such patterns — verify the editor still behaves after compiler transforms.
- **Fix:** Remove the unused plugin (or pin to the version Next expects), and add a `.react-ignore`/`noReactCompiler` opt-out on `MonacoEditor` if mis-optimized.

### 20. `wid` is never validated, and workspaces accumulate pollution
- `workspace.py:37-40,92-95` and `server.py:27,108,121` treat `wid` as an opaque path segment with only an existence check; malformed ids like `../` are not rejected up front (existence check limits blast radius, but it's sloppy and turns into a filesystem oracle).
- `server.py:84-88` sets `PUB_CACHE` to `base/.pub-cache` **inside the workspace**, so after one build `list_tree` (`workspace.py:42-69`) surfaces a huge `.pub-cache` directory (plus `.dart_tool`) in the file tree.
- **Fix:** Validate `wid` against `^[a-f0-9]{8}$` in every endpoint; move `PUB_CACHE` to a global location outside workspaces and skip dot/build dirs in `list_tree`.

---

## Top 5 most critical issues
1. **Backend can't start in Docker** — no `uvicorn.run`/`__main__`, and Flutter isn't in the image (issue #1).
2. **Arbitrary file read** via `/preview/{wid}/build/web/{path:path}` path traversal (issue #2).
3. **Frontend↔backend API mismatch** — wrong hosts/ports/paths and no workspace creation, so nothing works end-to-end (issue #3).
4. **No save path** — edits are never persisted to the backend (issue #4).
5. **Broken build SSE contract** — client reports success after `pub get`, hides real build failures (issue #7).
