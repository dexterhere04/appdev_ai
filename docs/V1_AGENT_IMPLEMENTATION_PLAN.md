# V1 Agent Implementation Plan

Status: **draft for review**
Inputs: [`V1_RELEASE_PLAN.md`](./V1_RELEASE_PLAN.md), `README.md`, `docs/`, `issues.md`.

This document turns the release plan's workstreams (W1–W10) into **separately
scoped agents**, each with a single owner, a defined file boundary, explicit
inputs/outputs, and a dependency order. It is the operational companion to the
release plan: the release plan says *what* and *why*; this says *who* and *in
what order*.

---

## 1. How to read this document

Every agent entry answers five questions:

1. **Goal** — the release-plan outcome it owns (with W# references).
2. **File boundary** — what it owns and, critically, what it must *not* touch
   (this is what makes parallel execution safe).
3. **Inputs / depends on** — contracts or prior agents it consumes.
4. **Outputs / provides** — deliverables and the contracts it exposes to others.
5. **Acceptance criteria** — the concrete test that proves the agent is done.

The single most important rule for parallel agents is **contract-first**: the
interfaces between agents are pinned in `docs/CONTRACTS.md` (produced by Agent 0)
before any dependent agent writes code against them.

---

## 2. The nine agents at a glance

| # | Agent | Owns (release-plan refs) | Runs |
| - | ----- | ------------------------ | ---- |
| 0 | **Foundation & Contracts** | M0; CI scaffold; seed tests; modularization; repo hygiene | first, alone |
| 1 | **Identity & Access** | W1 (auth half) | after 0 |
| 2 | **Data & Projects** | W1 (data half) + W3 | after 0; parallel with 1 |
| 3 | **Sandbox & Secrets** | W2 | after 2 (needs ownership) |
| 4 | **Preview Runtime** | W4 | after 2; parallel with 3 |
| 5 | **AI Code Generation** | W5 | after 2; parallel with 3/4 |
| 6 | **Frontend Reliability & UX** | W6 + frontend halves of W1/W3/W4/W9 | after 0; consumes 1,2,4 contracts |
| 7 | **QA & CI/CD** | W7 | from 0; final gate |
| 8 | **Ops, Trust & Docs** | W8 + W9 + W10 | parallel from 0 |

Dependency graph:

```
Agent 0 (Foundation & Contracts)
   │
   ├──► Agent 1 (Identity) ─────────────┐
   ├──► Agent 2 (Data/Projects) ────────┼──► Agent 3 (Sandbox)
   │                                    ├──► Agent 4 (Preview)
   │                                    └──► Agent 5 (AI)
   ├──► Agent 6 (Frontend)  ── consumes 1,2,4 contracts (can start on UI in parallel)
   ├──► Agent 7 (QA/CI)     ── from day 0, gates every merge
   └──► Agent 8 (Ops/Trust/Docs)
```

---

## 3. Shared contracts (pinned by Agent 0)

These interfaces must be written down in `docs/CONTRACTS.md` **before** Agents
1–8 write code. The purpose is to remove guesswork and let agents work without
asking each other questions.

1. **Auth mechanism (v1 decision).** Cookie-based HTTP-only session (SameSite) or
   Bearer token. Default: **HTTP-only session cookie** for the web app, because
   it simplifies CORS (W2) and works with the Next.js API. A read-only token is
   reserved for future API keys. Agent 1 owns the final word but must not change
   it after Agents 2/3/6 have started.
2. **Identity exposure.** FastAPI dependency `current_user` (or equivalent) that
   Agents 2–5 attach to every route. Standard 401 (`{"detail": "unauthorized"}`)
   and 403 (`{"detail": "forbidden"}`) shapes.
3. **Ownership guard.** A single `require_project(user_id, pid)` helper (Agent 2
   provides) that Agents 3/4/5 call before touching a project directory.
4. **Project route shape.** Replace `/api/workspaces/{wid}` with
   `/api/projects/{pid}/...` where `pid` is an opaque UUID. File/build/preview
   sub-paths stay the same so the frontend change is mechanical.
5. **Data model.** `users(id, email, created_at)`, `projects(id uuid, owner_id,
   name, created_at, updated_at)`. Storage in SQLite for v1 (single node,
   no extra infra) behind a repository module so Postgres is a later swap.
   Agent 2 owns the schema.
6. **Preview URL contract.** The frontend iframe always points at a same-origin
   path (`/preview/{pid}/...` for release builds, `/dev/{pid}/...` for the
   hot-reload server) that the backend proxies — no raw host ports in the
   browser. Agent 4 owns this.
7. **AI apply contract.** `POST /api/projects/{pid}/ai/generate` → coordinator
   returns `{ "files": [ { "path": str, "content": str } ] }`; the endpoint
   validates and applies via Agent 2's file API. Agent 5 owns validation rules.
8. **Build-event contract.** Keep the single-sentinel SSE (`data: __EXIT__ <code>`)
   from `server.py:235-256`. Agents 3/4 must not regress it; Agent 7's E2E
   depends on it.

---

## 4. Agent 0 — Foundation & Contracts

**Goal.** Establish the baseline (M0) that makes all other agents safe to run in
parallel: CI skeleton, regression tests seeded from the manual test record, code
modularization that creates clean file boundaries, and the contracts document.

**File boundary (owns).** `docs/CONTRACTS.md`; `backend/routers/` package skeleton;
CI workflow files; `.gitignore`; placeholder-asset cleanup; `backend/tests/` seed.

**Does not touch.** Business logic in `server.py`/`workspace.py` beyond extracting
route handlers into routers; no feature work.

**Outputs / provides.**
- `docs/CONTRACTS.md` — the eight contracts in §3, agreed and frozen.
- `backend/routers/` FastAPI `APIRouter` split (one router file per domain) so
  each later agent owns a file and only adds a one-line `include_router` in
  `server.py` — this is what prevents Agents 1–5 from all editing `server.py`.
- CI workflow(s): lint, typecheck, unit tests run on every PR.
- `backend/tests/` + `frontend` test harness seeded with regression tests
  transcribed from `docs/TESTING.md` (path/wid validation, traversal, binary
  detection, file ops, single-sentinel SSE).
- Repo hygiene: remove unused Next default assets (`frontend/public/*.svg`),
  placeholder favicon, dead `Share`/`Settings` buttons if trivial.

**Acceptance criteria.**
- `docs/CONTRACTS.md` exists and is reviewed/approved.
- A green CI run on `main` covering the seeded regression suite.
- `git grep -c "uvicorn" backend/server.py` shows routes now included via
  routers; `python server.py` still boots and `GET /healthz` returns 200.

---

## 5. Agent 1 — Identity & Access

**Goal.** Ship authentication and per-request ownership so that no workspace is
reachable without proving who you are (W1 auth half).

**File boundary (owns).** `backend/routers/auth.py`, `backend/auth/` (session,
token, middleware, providers), `backend/models/user.py`, frontend auth screens
(coordinated with Agent 6).

**Inputs / depends on.** Contracts 1, 2, 5. Agent 0's router split.

**Outputs / provides.**
- Login (OAuth Google/GitHub and/or email magic link) + logout + session
  endpoint.
- `current_user` dependency and ownership guard exported for Agents 2–5.
- CORS tightened to the real frontend origin (remove `allow_origins=["*"]`,
  `server.py:12-16`).
- Rate-limit scaffolding (the mechanism Agents 3/5 reuse for quota caps).
- 401/403 responses per contract 2.

**Acceptance criteria.**
- Unauthenticated request to any project/file/build route returns 401.
- Signed-in user A cannot read/write/build user B's project (403).
- `GET /healthz` remains unauthenticated (used by the container healthcheck).
- E2E (Agent 7) can complete a signed-in money-path run.

---

## 6. Agent 2 — Data & Projects

**Goal.** Introduce real, owned, persistent projects (W1 data half + W3).

**File boundary (owns).** `backend/routers/projects.py`, `backend/models/project.py`,
`backend/db.py` (metadata store), user-scoped disk layout under
`backend/workspaces/` keyed by opaque `pid`. Owns `workspace.py`'s path-scoping
changes only; does not change build internals.

**Inputs / depends on.** Contracts 3, 4, 5; Agent 1's `current_user`/guard.

**Outputs / provides.**
- `projects` CRUD API: list/create/rename/delete; project-scoped file/build/
  preview routes re-keyed to `/api/projects/{pid}/...`.
- `require_project(user_id, pid)` helper (contract 3) for Agents 3/4/5.
- Metadata store (SQLite via a repository module) + migrations.
- Storage accounting + quota hook (consumed by Agent 3).
- Deletes the `sessionStorage`-based bootstrap on the backend side (the frontend
  side is Agent 6).

**Acceptance criteria.**
- A user's project list persists across browser restarts and devices.
- Ownership is structural: the disk layout prevents cross-user reads even if a
  route guard were bypassed.
- `POST /api/workspaces` (legacy) is removed or aliased to the authenticated
  projects route; no unauthenticated workspace creation remains.

---

## 7. Agent 3 — Sandbox & Secrets

**Goal.** Make executing arbitrary user Dart + `pub` dependencies safe at
multi-tenant scale (W2).

**File boundary (owns).** `backend/build_runner.py`, `backend/sandbox/`,
`backend/secrets.py`, quota/GC modules, compose resource limits. Edits
`docker-compose.yaml` for limits only.

**Inputs / depends on.** Contract 2 guard (Agent 1) + contract 3 helper (Agent 2).
Needs a project to own before it can isolate — hence sequenced after Agent 2.

**Outputs / provides.**
- Per-project ephemeral sandboxed build execution: CPU/memory/time limits, no
  host FS access beyond the project tree, restricted network for `pub get`.
- **Environment scrubbing:** a `build_env()` allowlist (`PATH`, `PUB_CACHE`,
  Flutter vars, proxy vars) replacing the current `os.environ.copy()`
  (`server.py:177-179`) and `{**os.environ}` (`dev_server.py:141`), so
  `GEMINI_API_KEY` (loaded into `os.environ` by `gemini_config.py:13`) never
  reaches a build/dev child.
- Secrets loaded from files/secret store into the server process only.
- Quotas (workspace count, build concurrency, dev servers, storage) + workspace
  TTL/GC.

**Acceptance criteria.**
- A build/dev subprocess's `env` contains no secret keys (test asserts the
  allowlist).
- A malicious `pub` dependency cannot read another user's workspace or the host
  `.env`.
- Build exceeding time/memory budget is killed and reported, not hung.
- Resource limits present in `docker-compose.yaml`.

---

## 8. Agent 4 — Preview Runtime

**Goal.** Make hot-reload preview the default interactive experience in a real
production deploy (W4) — the product's core loop.

**File boundary (owns).** `backend/preview_proxy.py` (or router), dev-server
lifecycle, build queue. Backend-only; the frontend iframe changes are Agent 6's
job, driven by contract 6.

**Inputs / depends on.** Contracts 3, 6, 8; Agent 2 (project identity). Parallel
with Agent 3 but must consume Agent 3's `build_env()` once available.

**Outputs / provides.**
- Run-mode decoupled from `NODE_ENV`: a per-project hot-reload dev server is the
  default; release build is an explicit separate action.
- Dev server + WebSocket proxied behind the backend origin (no raw `8100-8131`
  host ports in the browser; removes the iframe `allow-same-origin` need).
- Dev-server lifecycle (start/stop/idle-kill) + per-user cap.
- Build queue: position, cancel, and Dart analyzer error surfacing.
- Preserves single-sentinel SSE (contract 8).

**Acceptance criteria.**
- In a production (`next start`) build, an edit → save produces a hot-reload
  preview update in seconds, not a `flutter build web` (proven by Agent 7 E2E).
- No `8100-8131` ports referenced in the frontend; preview iframe uses
  `sandbox="allow-scripts"` only.
- `docker-compose.yaml` no longer publishes the dev-port range for the browser.

---

## 9. Agent 5 — AI Code Generation

**Goal.** Make "AI writes a real app into my workspace" actually true (W5).

**File boundary (owns).** `backend/routers/ai.py`, `backend/ai_agents/` changes,
output validation module, progress-streaming endpoint. Consumes Agent 2's file
API to apply files.

**Inputs / depends on.** Contracts 3, 7; Agent 2. Parallel with 3/4 (applies to
owned projects once Agent 2 lands).

**Outputs / provides.**
- Coordinator returns validated `{files:[{path,content}]}` with path whitelist
  (`^[A-Za-z0-9_\-./]+$`, no `..`, no absolute), per-file size caps, file-count
  cap (reuse `workspace.py`'s validator; treat model output as untrusted).
- `POST /api/projects/{pid}/ai/generate` writes files into the project and
  returns applied-file list.
- Agent-by-agent progress streaming (vision → UX → UI → critique → code → style)
  instead of a single opaque JSON blob (replaces `page.tsx:42` raw display —
  frontend half is Agent 6).
- Deterministic no-LLM fallback (valid minimal app from prompt).
- Cost/latency guards: token/timeout caps, concurrent-generation cap, model
  tiering already in `gemini_config.py:79-101`.
- Preserve lazy import + graceful 503 (`server.py:266-269`).

**Acceptance criteria.**
- A prompt produces files in the user's project that build (mocked-LLM golden
  tests in CI + one real-key smoke pre-GA).
- Model output attempting traversal/oversized writes is rejected by the
  validator (test).
- No key required for the fallback path to return a valid app.

---

## 10. Agent 6 — Frontend Reliability & UX

**Goal.** Make the frontend trustworthy, fast, and coherent (W6 + the frontend
halves of W1/W3/W4/W9).

**File boundary (owns).** All of `frontend/src/**` except auth-screen wiring
co-owned with Agent 1. This is deliberately a **single owner** for the whole Next
app so Agents 1/4/5 never cause frontend merge conflicts — they only change
contracts.

**Inputs / depends on.** Contracts 3, 4, 6, 7. Can start UI scaffolding in
parallel but must wait on 1/2/4 for live wiring.

**Outputs / provides.**
- Auth screens (login/logout/session) wired to Agent 1.
- Real Projects UI (list/create/rename/delete/resume) replacing the mock sidebar
  (`WorkspaceLayout.tsx:82-178`) and the fake "John Doe / Free Plan" footer.
- Run-mode UX: hot-reload default, "Build" as explicit action, build queue +
  cancel + readable errors (consumes Agent 4's contract).
- AI chat → applied-files flow with progress (consumes Agent 5's contract).
- Reliability: vendor/bundle Monaco (no CDN), backend-down retry screen
  (replaces the swallowed error at `BuildContext.tsx:82-84`), multi-tab
  conflict handling, onboarding + empty states.
- Remove dead Share/Settings buttons or wire them.

**Acceptance criteria.**
- Money-path E2E (Agent 7) passes against the real backend.
- No mock user/project data renders anywhere in a signed-in session.
- Editor mounts without network (Monaco bundled).
- Backend-down shows a retry UI, never an empty frozen IDE.

---

## 11. Agent 7 — QA & CI/CD

**Goal.** Make the release credible: automated proof that the money path and the
security boundary stay intact (W7).

**File boundary (owns).** Test suites (`backend/tests/`, `frontend/e2e/`),
CI/CD workflows, security-scan config, deploy pipeline. No production feature
code.

**Inputs / depends on.** Contracts (esp. 8), and every agent's acceptance
criteria, which it turns into executable tests.

**Outputs / provides.**
- Backend pytest: unit (validation/traversal/binary/file-ops) + API-contract
  (TestClient) + heavy integration against the real Flutter SDK image.
- Playwright money-path E2E: sign in → create project → edit Dart → save →
  hot-reload preview appears → build succeeds.
- Mocked-LLM AI tests + a real-key smoke (pre-GA, not in normal CI).
- Scans: `pip-audit`/`npm audit`, `trivy` on images, `semgrep`/`bandit`,
  ESLint — fail on high severity.
- CI on PR + CD to staging on merge and prod on tag.

**Acceptance criteria.**
- Every agent's merge is blocked unless its tests + scans pass.
- E2E proves the release plan's metric loop (edit → preview in seconds) as an
  executable assertion.
- A release tag produces a deployable artifact with pinned versions.

---

## 12. Agent 8 — Ops, Trust & Docs

**Goal.** Observability, legal/trust surface, and documentation accuracy (W8 + W9
+ W10).

**File boundary (owns).** Logging/metrics/error-tracking config, deployment
stack (reverse proxy, TLS, backups), `README.md`/`docs/**`/`docs/API.md`
accuracy, LICENSE, privacy/ToS, branding assets.

**Inputs / depends on.** Contracts + the final behaviors from Agents 1–6 (docs
must reflect reality, so this finishes last, but ops scaffolding can start from
day 0).

**Outputs / provides.**
- Structured logs (request id, user id, project id, latency; no secrets/PII
  beyond user id); remove emoji/verbose prints (e.g. `workspace.py:162`).
- Metrics + alerts: HTTP error rate, build queue depth/duration, dev-server
  failures, AI latency/cost/success, disk usage. Error tracking wired to a real
  inbox.
- TLS-terminating reverse proxy + restricted origin; secret injection at deploy;
  metadata backups; single-node scaling envelope documented.
- Product name/logo/favicon/title/description; onboarding final copy; privacy
  policy + ToS; repo LICENSE; remove the Next default favicon.
- Update `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md` for the new
  project/auth/dev/AI endpoints and the v1 SaaS topology.

**Acceptance criteria.**
- `docs/API.md` documents every route that exists in `server.py`/routers (no
  drift — enforced by a doc-review step in CI).
- Logs contain no secrets; metrics endpoints respond; alerts route somewhere
  monitored.
- LICENSE, privacy, ToS, and real branding present; no placeholder favicon.
- No `print()` debug noise on the hot paths.

---

## 13. Execution order & parallelization

1. **Week 1 — Agent 0 alone.** Freeze contracts, router split, CI skeleton, seed
   tests. Nothing else starts until `docs/CONTRACTS.md` is approved.
2. **Week 2 — Agents 1, 2, 6 (UI scaffolding), 7, 8 (ops scaffolding) in
   parallel.** Agents 1 and 2 are independent once contracts are frozen (1 owns
   auth, 2 owns data; they share only the `current_user` dependency, defined in
   the contract).
3. **Week 3+ — Agents 3, 4, 5 in parallel on top of Agent 2.** They integrate
   through the `require_project` guard and the `build_env()` allowlist, not by
   editing each other's files.
4. **Agent 6 wires live as 1/2/4 land** (its UI can be built against mocked
   contracts early, then switched to real endpoints).
5. **Agents 7 and 8 run continuously** and are the final gate before the M5 beta.

### Conflict-avoidance rules (non-negotiable)

- **One owner per file.** `server.py` is touched only by Agent 0's router split
  and one-line `include_router` additions; everything else lives in
  `backend/routers/*` owned by exactly one agent.
- **Backend/frontend boundary is the contract.** Agents 1–5 never edit
  `frontend/`; Agent 6 never edits `backend/` (except its auth screen co-owned
  with Agent 1, and only the frontend files).
- **Contracts are immutable after Week 1** unless a change is approved by the
  agent that owns the contract and broadcast to all dependents in the same PR.

---

## 14. Definition of done (all agents)

Repeating the release plan's gate (G0): v1 is releasable when all nine agents'
acceptance criteria are green, the money-path E2E passes in CI, secrets are
provably absent from build environments, docs match code, legal/trust surfaces
exist, and a beta cohort has exercised it for two weeks with the bug list
cleared.
