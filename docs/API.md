# API Reference

Base URL (local): `http://localhost:5000`

`wid` (workspace id) is a lowercase 8-hex string (`^[a-f0-9]{8}$`, e.g. `5a5482c0`).
All endpoints validate it and return **400** for a malformed id and **404** when the
workspace does not exist.

## Workspaces

### `POST /api/workspaces`
Creates a new Flutter workspace (copies `templates/blank/`, runs `flutter create . --platforms web`).

**Request body:** none

**Response 200**
```json
{ "workspaceId": "5a5482c0" }
```

**500** — `flutter` is not installed on `PATH`, `flutter create` failed, or it
timed out (120s). A failed creation is cleaned up; no partial workspace is left behind.

> `flutter create` still runs synchronously on the request, but it is bounded by a
> 120s timeout and surfaces a clean error instead of an unhandled exception.

### `GET /api/workspaces/{wid}`
Returns a recursive file tree for the workspace.

Hidden entries (names starting with `.`, e.g. `.dart_tool`, `.git`) and build output
(`build/`) are excluded.

**Response 200**
```json
{
  "files": [
    { "id": "lib", "path": "lib", "name": "lib", "type": "dir",
      "children": [ { "id": "lib/main.dart", "path": "lib/main.dart", "name": "main.dart",
                      "type": "file", "size": 621 } ] }
  ]
}
```

**400** — malformed `wid`. **404** — workspace not found.

## Files

### `GET /api/workspaces/{wid}/file?path=<relpath>`
Reads a file.

**Response 200**
```json
{ "path": "lib/main.dart", "content": "..." }
```

**400** — invalid path (rejected by `SAFE_PATH` regex, `..` segments, absolute path).
**404** — workspace or file not found.

### `PUT /api/workspaces/{wid}/file`
Writes a file (creates parent dirs; `fsync`'d).

**Request body**
```json
{ "path": "lib/main.dart", "content": "void main() {}" }
```

**Response 200** — `{ "ok": true }`
**400/404** — as above.

## Build & Preview

### `POST /api/workspaces/{wid}/build`
Validates the workspace and cleans `build/web/`, then returns streaming + preview
URLs. **Does not run the build** — the build runs when the SSE stream is opened.

**Response 200**
```json
{
  "logs":   "/api/workspaces/5a5482c0/build/logs",
  "preview": "/preview/5a5482c0/build/web/index.html"
}
```

### `GET /api/workspaces/{wid}/build/logs`
Server-Sent Events (text/event-stream). Runs `flutter pub get`, then (only if that
succeeds) `flutter build web --release --pwa-strategy=none`, streaming output lines
as `data: <line>`. A **single** `data: __EXIT__ <code>` sentinel is emitted at the
very end of the whole pipeline. Each workspace has a build lock, so concurrent
build triggers against the same workspace serialize instead of racing.

```
data: Running flutter pub get...
data: Building web...
data: __EXIT__ 0
```

If `pub get` fails, the build step is skipped and the sentinel carries the
non-zero exit code. A `data: Build finished. Open preview URL.` line is emitted
only after a successful web build.

### `GET /preview/{wid}/build/web/{path:path}`
Serves built Flutter web assets. `index.html` gets a rewritten
`<base href="/preview/{wid}/build/web/">`.

**200** — file served (HTML for `index.html`, `FileResponse` for assets).
**404** — malformed `wid`, path that escapes the build directory, or missing file.

> `path` is resolved and verified to stay inside `<workspace>/build/web` with
> `Path.resolve().is_relative_to()` before serving; traversal via `..` is rejected.

## AI generation

### `POST /api/ai/generate`
Runs the multi-agent Gemini design pipeline (`ai_agents/` + `gemini_config.py`)
for a text prompt.

**Request body**
```json
{ "prompt": "A personal finance tracker" }
```

**Response 200**
```json
{ "result": "..." }
```

**400** — missing/empty `prompt`.
**503** — AI pipeline unavailable (no `GEMINI_API_KEY`, or optional deps
`langchain`/`langchain-google-genai`/`google-generativeai` not installed). The
server starts fine without these; the pipeline is imported lazily.
**502** — pipeline imported but generation failed.

> The pipeline requires `GEMINI_API_KEY` in `backend/.env` and the AI
> dependencies in `requirements.txt`. Without them the endpoint degrades
> gracefully to 503 instead of crashing the server.
