# API Reference

Base URL (local): `http://localhost:5000`

All routes except `/healthz`, `/api/auth/register`, `/api/auth/login`, and the
signed `/preview/{pid}` routes require a session token:

```
Authorization: Bearer <token>
```

Obtain a token from `POST /api/auth/register` or `POST /api/auth/login`
(response `{ "token": "...", "user": {...} }`).

Standard errors:

| Code | Meaning |
| ---- | ------- |
| 400 | malformed `pid`/path/body |
| 401 | missing/invalid/expired token |
| 403 | authenticated but not the project owner |
| 404 | project/file/preview not found |

## Auth

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| POST | `/api/auth/register` | `{email, password}` | `{token, user}` (201) |
| POST | `/api/auth/login` | `{email, password}` | `{token, user}` |
| POST | `/api/auth/logout` | — | `{ok:true}` |
| GET | `/api/auth/me` | — | `{user}` |

Passwords are PBKDF2-HMAC-SHA256 hashed; session tokens are opaque and stored
server-side hashed (SHA-256). Registration is open for v1 (no email
verification); rate-limited per IP.

## Health & metrics

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/healthz` | unauthenticated liveness probe (`{status:"ok"}`) |
| GET | `/metrics` | plain-text counters (`fcb_*`) for scraping |

## Projects

`pid` is an opaque 32-hex UUID.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/projects` | list my projects → `{projects:[...]}` |
| POST | `/api/projects` | create + provision (`flutter create`) → `{project}` (201); 429 over per-user limit |
| PATCH | `/api/projects/{pid}` | rename → `{project}` |
| DELETE | `/api/projects/{pid}` | delete project + on-disk GC |

## Project files

Relative paths are validated: `^[A-Za-z0-9_\-./]+$`, no `..`, no absolute.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/projects/{pid}/files` | recursive tree → `{files:[...]}` |
| GET | `/api/projects/{pid}/file?path=` | read → `{path,content}` or `{path,binary,size,image}` |
| PUT | `/api/projects/{pid}/file` | write `{path,content}` (fsync) |
| DELETE | `/api/projects/{pid}/file?path=` | delete file/empty dir |
| POST | `/api/projects/{pid}/file/rename` | `{path,newPath}` |
| POST | `/api/projects/{pid}/folder` | `{path}` create folder(s) |
| GET | `/api/projects/{pid}/raw?path=` | raw bytes (images/assets) |

## Build & preview

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/projects/{pid}/build` | clean `build/web`; returns `{logs, preview}` where `preview` includes a signed `?access=` token |
| GET | `/api/projects/{pid}/build/logs` | SSE build stream (single `data: __EXIT__ <code>` sentinel; `0` = success) |
| POST | `/api/projects/{pid}/build/cancel` | cancel an in-flight build |
| GET | `/preview/{pid}/...` | serve release build (signed `?access=` or path-scoped HttpOnly cookie) |

The `preview` URL returned by `POST /build` carries the access token, so the
frontend iframe can load it without an `Authorization` header. Serving it sets a
path-scoped cookie so asset subrequests authenticate. No token → 404.

## Dev server (hot reload)

Dev servers run on **their own per-project origin** (not a shared sub-path),
because Flutter's debug tooling opens a root-absolute WebSocket. Compose
publishes `8100-8131`; `dev/start` returns the reachable `http://<host>:<port>/`.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/projects/{pid}/dev/start` | start `flutter run -d web-server` → `{url, port, running}`; 429 over per-user limit |
| POST | `/api/projects/{pid}/dev/hot-reload` | trigger reload → `{ok, note}` |
| POST | `/api/projects/{pid}/dev/stop` | stop dev server |
| GET | `/api/projects/{pid}/dev/logs?lines=` | recent dev-server logs |

## AI generation

| Method | Path | Purpose |
| ------ | ---- | ------- |
| POST | `/api/projects/{pid}/ai/generate` | run pipeline → `{applied:[...], source:"ai"\|"fallback", logs:[...]}` |
| POST | `/api/projects/{pid}/ai/generate/stream` | SSE agent progress, ends with `__AI_DONE__ <json>` / `__AI_ERROR__` |

AI output is treated as untrusted: paths are validated, file sizes/counts are
capped, and writes go through the same file repository as manual edits. Without
a `GEMINI_API_KEY` a deterministic fallback app is generated so the feature
never hard-fails. `400` empty prompt, `503` pipeline unavailable.
