# API Reference

Base URL (local): `http://localhost:5000`

## Workspaces

### `POST /api/workspaces`
Creates a new Flutter workspace (copies `templates/blank/`, runs `flutter create . --platforms web`).

**Request body:** none

**Response 200**
```json
{ "workspaceId": "5a5482c0" }
```

> Blocks on `flutter create` synchronously; failures surface as 500.

### `GET /api/workspaces/{wid}`
Returns a recursive file tree for the workspace.

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

**404** — workspace not found.

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
Cleans `build/web/` and returns streaming + preview URLs. **Does not run the build.**

**Response 200**
```json
{
  "logs":   "/api/workspaces/5a5482c0/build/logs",
  "preview": "/preview/5a5482c0/build/web/index.html"
}
```

### `GET /api/workspaces/{wid}/build/logs`
Server-Sent Events (text/event-stream). Runs `flutter pub get` then
`flutter build web --release --pwa-strategy=none`, streaming output lines as
`data: <line>` and a `data: __EXIT__ <code>` sentinel after **each** step.

```
data: Running flutter pub get...
data: __EXIT__ 0
data: Building web...
data: __EXIT__ 0
data: Build finished. Open preview URL.
```

> The frontend currently treats the first `__EXIT__` (after `pub get`) as
> "Build complete!" — only the final sentinel reflects the web build result.

### `GET /preview/{wid}/build/web/{path:path}`
Serves built Flutter web assets. `index.html` gets a rewritten
`<base href="/preview/{wid}/build/web/">`.

**200** — file served (HTML for `index.html`, `FileResponse` for assets).
**404** — file missing.

> `path` is not confined to the build directory in application code; safe only
> because the ASGI server normalizes `..` before routing.

## Commented out / not live

- `POST /api/ai/generate` — AI pipeline endpoint is commented out in `server.py`.
- The multi-agent Gemini pipeline (`ai_agents/`, `gemini_config.py`) is only
  reachable via `testing1.py` / `testing2.py`.
