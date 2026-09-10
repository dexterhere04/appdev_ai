# V1 Release Plan — Flutter Cloud Builder

Status: **draft for review**
Audience: founders + engineers
Scope: everything that must be true before the **first official (v1) release** as a
**hosted multi-tenant SaaS** with **accounts** and **AI generation as a core
feature that writes code into the user's workspace**.

This document has three parts:

- **Part A — Product definition.** Why this is a good product, who it is for,
  and the scope we are deliberately choosing for v1. Every decision in Part B
  traces back to a claim here.
- **Part B — Release gates & workstreams.** The concrete gaps (with code
  evidence) and the work required to close them, each with its rationale.
- **Part C — Sequencing, milestones, and risks.**

A companion summary of "what already works" is in `README.md` and `docs/`.
The 20 issues in `issues.md` are fixed; this plan covers what happens *after*
those fixes — the step from working prototype to releasable product.

---

## Part A — Product definition

### A.1 The product in one sentence

> A browser-based IDE where a Flutter developer (or an AI guided by a developer)
> writes Dart and gets a **real-SDK, hot-reloading Flutter preview running in the
> cloud** — no local Flutter install, no waiting through setup, no "it works on
> my machine."

### A.2 Why this is a good product (the reasoning)

1. **The core loop is genuinely scarce.** CodePen/CodeSandbox/Replit are
   language-agnostic and not Flutter-native. FlutterFlow is no-code with
   vendor lock-in and no raw Dart editing. Local Flutter is free but has a
   heavy install + toolchain cost and no instant sharing. A *browser-native IDE
   wired to the real Flutter SDK with live hot reload* sits in the empty middle.
2. **The moat is the infrastructure.** Running `flutter create`, `pub get`, and
   `flutter build` / `flutter run -d web-server` per project, safely, at
   multi-tenant scale is the hard part — it is the defensible asset. The code
   editing (Monaco) is commodity.
3. **It removes the two biggest friction points for Flutter adoption:**
   - *Setup friction*: workspace provisioning + first preview happen on the
     server, not the developer's machine.
   - *Feedback friction*: hot reload means edit → see result in seconds, which
     is the moment-to-moment experience that makes a tool feel good.
4. **AI is a funnel, not the product.** For v1 the paying loop is the
   developer's edit→preview loop. AI lowers the blank-canvas barrier
   ("describe an app → get a compiling scaffold I can then edit"). That ordering
   (dev-loop first, AI as accelerator) is why AI is in scope but its bar is
   "writes valid code into the workspace," not "perfect apps."
5. **Export is the trust mechanism.** Users can always read/download the source
   of every project they build. That is the counter-position to no-code lock-in
   and the reason a full file tree + file API is a feature, not an accident.

### A.3 Target users for v1

| Persona | Job to be done | v1 priority |
| ------- | -------------- | ----------- |
| Flutter/developer exploring an idea | Prototype a Flutter app in the browser, iterate fast on a phone frame | **Primary** |
| Developer evaluating Flutter | Try real Flutter without installing the SDK | Primary (same loop) |
| Non-developer using AI prompts | Describe an app, get a preview | Secondary — growth path, don't optimize for them yet |

### A.4 The metric that defines "good" (instrument these before GA)

- **Time from landing to first live preview** (target ≤ ~60 s incl. workspace
  provisioning; the single most important number).
- **Median edit→preview refresh latency** (hot-reload path: seconds; release
  build: explicit user action only).
- **Build success rate** (release + dev-server start) — target ≥ 95%.
- **Save reliability** — zero silent edit loss.
- **AI success rate** — fraction of generations that produce valid,
  workspace-applied code (structured-output success), plus median latency and
  $ cost per generation.
- **Retention proxy** — projects created per user, projects revisited.

### A.5 Explicit v1 non-goals (write these down so scope holds)

- **No** horizontal scale-out to many nodes — v1 is a well-run single node with
  documented capacity; the build-queue + metadata design must *not* block
  scaling later.
- **No** real-time collaboration or multi-cursor editing.
- **No** "AI edits your current file in place" — AI v1 generates a **new app /
  new files** into the workspace. In-place editing is v1.1 (much harder: needs
  reliable file-context windowing + safe apply).
- **No** paid billing tiers — v1 ships free accounts + quotas to protect
  cost/infra; billing is post-GA.
- **No** marketplace, templates library, or shareable public preview links
  (revisit after GA).

---

## Part B — Release gates & workstreams

### G0 — Definition of "official v1" (the release gate)

v1 is releasable only when **all** of the following are true:

1. **Identity + ownership:** a user can sign in (email magic link or OAuth) and
   every workspace is owned by exactly one user; no unauthenticated access to
   any workspace's files, build, preview, or dev server. `wid` is no longer a
   usable capability token on its own.
2. **Untrusted code isolation:** user code and `pub` dependencies execute inside
   a sandbox with resource limits and no access to server secrets, other users'
   workspaces, or the host network beyond what's required to build.
3. **The money loop works and feels good:** land → open project → edit Dart →
   hot-reload preview updates in seconds; the "Projects" view lists real,
   persisted projects (not mockups); reloading the browser does not strand work.
4. **AI writes code:** prompting produces a valid Flutter app whose files land
   in the user's workspace and build; failure modes are surfaced cleanly.
5. **Release hygiene:** automated tests + CI run on every PR; lint/typecheck
   clean; dependency + container security scans pass; structured logs and
   metrics exist; secrets never appear in images, env dumps, or build
   subprocesses.
6. **Trust:** landing page, onboarding, privacy policy, ToS, LICENSE, and a
   working support channel.
7. **Beta cohort:** the above is exercised by ≥ ~20 external users for ≥ 2
   weeks with a named bug list cleared before GA.

---

### W1 — Identity & multi-tenancy  (P0)

**Current gap.** There is no user concept anywhere. The workspace id is an
8-hex string stored in `sessionStorage`
(`frontend/src/context/BuildContext.tsx:66-85`) and re-sent by the frontend.
Backend endpoints validate only the format, not the caller
(`backend/server.py:30-31`, `backend/workspace.py:14-16`). Anyone who obtains or
brute-forces a `wid` (2^32 space) can read/write that workspace and trigger
builds and dev servers. The sidebar "Projects" list, "New Project" button,
user footer ("John Doe / Free Plan"), and the Projects empty-state are static
mockups (`frontend/src/components/WorkspaceLayout.tsx:82-178`).

**Required work**
- AuthN: OAuth (Google/GitHub) and/or email magic-link login. Issue short-lived
  session tokens; prefer HTTP-only SameSite cookies (then tighten CORS in W2)
  or an Authorization header scheme the frontend stores safely.
- Data model: `users` and `projects` (id, owner_id, display name, workspace dir,
  timestamps). Metadata in a small DB (Postgres or SQLite) — files stay on disk.
- Backend ownership checks on **every** endpoint (file tree/read/write/delete/
  rename/folder/raw/build/logs/preview/dev/*): resolve project by opaque id,
  assert `project.owner == current_user`, else 403.
- Replace the mock Projects UI with a real list + create/rename/delete +
  "resume editing".
- Replace `sessionStorage` bootstrap logic with an authenticated, server-backed
  "my active project / open project" flow; surface bootstrap failures instead of
  `console.error`-and-leave-the-app-empty (`BuildContext.tsx:82-84`).
- Opaque, unguessable project ids (full UUIDs) rather than 8-hex.

**Why this makes it a good product.** Nothing else on this list matters for a
hosted product until users can (a) trust that their work is private and
persisted to their account, and (b) return tomorrow and find it. Identity is
also the prerequisite for quotas (W2), project persistence (W3), and future
monetization.

---

### W2 — Isolation, secrets, and hardening  (P0)

**Current gap.** Multi-tenant SaaS means running **arbitrary user Dart and
arbitrary `pub` dependencies** as code on our servers. Today:

- Builds run as the server process with full privileges and network:
  `subprocess` calls in `server.py:237-250` and `dev_server.py:104-179`.
- **Secret leak path:** `flutter` child processes inherit the whole environment —
  `_flutter_env` returns `os.environ.copy()` (`server.py:177-179`) and the dev
  server uses `{**os.environ, ...}` (`dev_server.py:141`). Once the AI pipeline
  has run, `gemini_config.py:13` (`load_dotenv`) has put `GEMINI_API_KEY` into
  `os.environ`, so a later `flutter pub get`/build/dev-run child can read it —
  i.e. user code can exfiltrate the Gemini key.
- CORS is `allow_origins=["*"]` (`server.py:12-16`); combined with no auth this
  means any website can drive our compute.
- No rate limiting, no per-user quotas, no build-concurrency cap, no storage
  cap. `POST /api/workspaces` spawns a `flutter create` per call
  (`server.py:78-84`).
- No resource limits in `docker-compose.yaml`; no workspace TTL/GC — workspaces
  and pub caches accumulate forever.

**Required work**
- **Build sandbox (the big one):** execute user builds in a per-project
  ephemeral container (or equivalent strong isolation) with:
  - CPU/memory/time limits (kill builds exceeding budget);
  - no host filesystem access except the project's own tree;
  - network policy — a restricted allowlist or offline proxy for `pub get`
    (users must be able to add packages, but the network is a top abuse +
    supply-chain vector);
  - no volume mounting of host secrets.
- **Scrubbed child environment:** builds/dev servers receive an explicit
  allowlist env (`PATH`, `PUB_CACHE`, Flutter vars, proxy vars only) — never
  `os.environ`. Load `GEMINI_API_KEY` from a file/secret store into the server
  process only (never rely on it being absent from children; scrub at the
  subprocess boundary regardless).
- **CORS:** restrict to the real frontend origin(s); if cookie sessions are
  used, keep credentials semantics correct.
- **Rate limits + quotas:** per-user caps on workspace creation, concurrent
  builds, dev servers, AI calls (cost), and stored bytes. Global build queue
  with a max concurrency.
- **Lifecycle:** workspace/project TTL + GC for abandoned projects; cleanup of
  dev-server processes and temp build dirs on session end.
- **Preview hardening:** keep the built-app iframe `sandbox="allow-scripts"`
  only (already true for release previews, `PreviewPane.tsx:89`); revisit the
  dev preview iframe which currently needs `allow-same-origin` for the hot-reload
  WebSocket (`PreviewPane.tsx:75`) — prefer proxying the dev-server WebSocket so
  the sandbox can be strict everywhere.

**Why this makes it a good product.** For a Flutter-in-the-browser SaaS, the
entire product *is* running user code. The moment users share a host, isolation
is the product's license to exist: leaks (GEMINI key, another user's project) or
abuse (crypto mining via `pub` deps, disk exhaustion) kill trust instantly and
permanently. This workstream is what turns a demo into something safe to point
strangers at.

---

### W3 — Project & persistence layer  (P0)

**Current gap.** A "project" today is just a directory under
`backend/workspaces/<wid>` created on first load and tied to a browser session.
There is no project name, list, ownership, or cross-session continuity. The UI
already implies Projects exist (sidebar view) but they are fake.

**Required work**
- Metadata store (see W1) linking user → projects → workspace directories.
- Backend API: list/create/rename/delete projects; project-scoped file/build/
  preview routes keyed by opaque project id.
- Disk layout under a user-scoped namespace so ownership is structural, not just
  a DB row.
- Storage accounting + quota enforcement hooks (used by W2).

**Why this makes it a good product.** The developer loop is "I'm coming back to
finish this tomorrow." Persistence across devices and sessions is a baseline
expectation; without it the tool is a toy. This also unblocks export/source
download later.

---

### W4 — SaaS preview architecture: hot reload by default  (P0, core UX)

**Current gap.** The frontend picks the preview strategy from `NODE_ENV`
(`BuildContext.tsx:35`, `triggerBuild` at `:226-233`): under `next dev` it uses
`flutter run -d web-server` + hot reload; in a production build it runs a full
`flutter build web --release` on every build. Worse, `schedulePreviewRefresh`
(`BuildContext.tsx:236-257`) auto-triggers a release rebuild ~1.5 s after every
save — in the prod (standalone) deployment the "live preview" would be a
30-90 s rebuild per save. That would make the primary product loop feel broken,
and it means today the good experience only exists while running Next in dev
mode on the server — not a viable SaaS deployment.

**Required work**
- Decouple "run mode" from the environment: a per-project, user-triggered
  **hot-reload dev server is the default interactive preview**; release builds
  are an explicit, separate action ("Build / Publish").
- Move the dev server behind a controlled route on the backend origin (proxied
  HTTP + WebSocket) rather than exposing raw host ports (`docker-compose.yaml`
  currently publishes `8100-8131` to the host for every backend). This fixes
  both the iframe-sandbox weakness in W2 and firewall/host-port sprawl.
- Per-project dev-server lifecycle: start/stop with the project session,
  bounded count per user (ties into W2 quotas), kill on inactivity.
- Improve release-build UX: queue position, cancel, incremental status, and
  Dart analyzer error surfacing instead of raw `flutter` log lines.
- Keep the single-sentinel SSE contract (`server.py:235-256`) — it is correct
  now; do not regress it.

**Why this makes it a good product.** The thing that makes a cloud IDE feel
better than local Flutter is *not* running the same slow release build — it is
**hot reload in a phone frame**. If v1 ships "release build only," the product's
core promise (fast iteration) is false advertising. This workstream is the
difference between "a clever build server" and "a joy to use daily."

---

### W5 — AI pipeline v1: writes code into the workspace  (P0 — declared core)

**Current gap.** The 7-agent LangChain pipeline exists and is lazily importable
(`server.py:261-275`), but its output is a single JSON blob shown as raw text in
a chat strip (`page.tsx:42`). Nothing applies generated files to the workspace,
so the product's stated headline ("AI turns a prompt into a Flutter app") is not
delivered. The pipeline has also never been exercised end-to-end with a real key
(`docs/TESTING.md` — only the 503 degradation was verified).

**Required work**
- **Structured, validated file output.** Codewriter (`ai_agents/codewriter.py`)
  already asks for `[{file, content}]`; make this a hard schema at the
  coordinator boundary (`ai_agents/coordinator.py:28-37`) with JSON validation,
  path whitelist (`^[A-Za-z0-9_\-./]+$`, no `..`, no absolute — reuse the
  backend's own validator), size caps per file, and a file-count cap.
- **Apply to workspace.** Coordinator returns `{files:[...]}`; the endpoint
  writes them via the existing `PUT /file` path into the requesting user's
  project. Model output is **untrusted** — validate everything server-side, not
  by trusting the model's JSON.
- **Progress + partial-failure UX.** Stream agent-by-agent status (vision → UX →
  UI → critique → code → style) so a 20-60 s generation never looks hung; if a
  step fails, surface a partial result + error instead of an opaque 502.
- **Deterministic fallback.** A no-LLM "generate a minimal valid app from this
  prompt" path so the feature works even when the model or quota fails — this
  protects the *product promise* (get a scaffold) from the *model dependency*.
- **Cost & latency guards:** token/timeout caps per step, model choice per role
  already exists (`gemini_config.py:79-101`) — cap concurrent generations per
  user and total (W2), cache nothing sensitive.
- **Prompt-injection hygiene:** generation is into the user's *own* sandboxed
  project, so the worst case is bounded; still forbid writes outside the project
  and re-validate all paths/sizes.
- **E2E test with a real key** before GA (golden app build), plus mocked-LLM
  tests in CI (W7).
- Keep lazy import + graceful 503 (`server.py:266-269`).

**Why this makes it a good product.** For v1's primary persona (devs prototyping
Flutter) AI must *save real time*, which only happens if the output is editable,
compiling code they own — not a spec document. "It generated a runnable app I
can now edit" is the demo moment that turns a visitor into a user. Unreliable
JSON-pretty-printed into a chat box would actively hurt the brand.

---

### W6 — Core-loop reliability & UX gaps  (P1)

**Current gap / required work, each with rationale:**
- **Workspace provisioning latency.** `flutter create` runs synchronously per
  new workspace (`workspace.py:33-38`, up to 120 s timeout) on the request
  thread of a single event loop server. Cache a warmed template dir + pub cache
  and copy, or pre-provision a small pool, so first-preview lands in seconds.
  Directly serves metric A.4 #1.
- **Monaco is fetched from CDN.** `@monaco-editor/react` loads Monaco from
  jsDelivr by default (see `CodeEditor.tsx`); if the CDN is slow/blocked the
  editor silently never mounts. Vendor/bundle Monaco in v1 for deterministic
  load and CSP-friendliness.
- **Multi-tab / lost work.** Today two tabs bootstrap two separate
  `sessionStorage` workspaces (`BuildContext.tsx:67-85`) — edits split and
  silently diverge. With W1 projects, add save-conflict detection (e.g.
  content hash on `PUT`) or at least "file changed on server — reload?" in v1.
- **Backend-down UX.** `bootstrap` failure is swallowed with a console log and
  leaves a permanently empty IDE (`BuildContext.tsx:82-84`). Show a real error +
  retry screen.
- **Binary assets.** Upload/overwrite of images is server-side capable
  (`/raw`, binary detection) but there is no UI to upload an asset into
  `assets/`. Low effort, high demo value; include if time allows.
- **Cleanup of template cruft** — remove unused Next default assets
  (`frontend/public/{file,globe,next,vercel,window}.svg`), placeholder
  `favicon.ico` (still the Next one), and dead Share/Settings buttons
  (`Navbar.tsx:65-71`) unless W9 wires them.

**Why this makes it a good product.** These are the small frictions that decide
whether the demo loop feels "magic" or "flaky." Reliability is the product for a
developer tool — one lost edit or one hung "building…" is enough to lose a user
for good.

---

### W7 — Automated tests + CI/CD  (P0 for release credibility)

**Current gap.** Zero automated tests in the repo. `docs/TESTING.md` is an
excellent *manual* record, but nothing runs on commit, so regressions (like the
20 in `issues.md`) are guaranteed to return. No CI, no deploy pipeline.

**Required work**
- **Backend (pytest):** unit tests for path/wid validation, traversal
  rejection, tree/binary detection, file ops (write/delete/rename/folder/
  prune), env scrubbing of subprocesses; API-contract tests against FastAPI's
  TestClient with the real Flutter SDK in the CI image (tagged "integration";
  a heavy but necessary suite) plus fast mocked tests for everything else.
- **Frontend:** typecheck + lint already clean — make them CI jobs; add
  Playwright **money-path E2E**: sign in → create project → edit a Dart file →
  save → dev preview appears → build succeeds.
- **AI:** mocked-LLM golden tests (coordinator → files → apply → path safety);
  one real-key smoke test pre-GA (not in normal CI due to cost).
- **Scans:** `pip-audit`/`npm audit`, dependency vuln check, `trivy` on built
  images, `semgrep`/`bandit` on the backend, ESLint on the frontend. Fail on
  high severity.
- **CI/CD:** GitHub Actions on PR (lint, typecheck, unit tests, E2E, build
  images, scans) + CD to staging on merge and to prod on a release tag.
  Enforce branch protection.

**Why this makes it a good product.** An "official version" is a promise to
users that today's behavior is tomorrow's baseline. Tests are the only thing
standing between the current well-fixed state and a fast regression spiral as
W1-W5 land. The money-path E2E encodes the product thesis (Part A) as an
executable assertion.

---

### W8 — Observability & operations  (P1)

**Current gap.** Logging is `print()` noise (`workspace.py:162` logs every save
with an emoji and full path); there is no structured logging, request/build/AI
metrics, error tracking, or `/metrics`. `docker-compose.yaml` has healthchecks
and restart policies (good) but no limits. The backend is single-worker with
in-memory build locks and dev-session state (`server.py:23-28`,
`dev_server.py:56-57`) — fine for one node, fatal if you add a second.

**Required work**
- Structured logs (request id, user id, project id, latency); **no secrets,
  no file contents, no PII** beyond a user id in logs. Remove emoji/verbose
  prints.
- Metrics + alerting: HTTP error rate, build queue depth & duration, dev-server
  start failures, AI latency/cost/success, workspace disk usage. Error tracking
  (frontend + backend) wired to an inbox you actually check.
- Deployment stack: TLS-terminating reverse proxy, restricted CORS origin,
  secrets via env-of-file at deploy time (never baked into images — already
  mostly true: `.dockerignore` excludes `.env`), automated backups for the
  metadata DB, image version tags pinned at deploy.
- **Document the single-node scaling envelope** and keep the W2/W4 abstractions
  (queue, per-project sandbox, metadata DB) clean so horizontal scale-out is a
  later feature, not a rewrite.
- Add resource requests/limits to compose and enforce per-process memory caps
  (ties to W2).

**Why this makes it a good product.** You cannot claim "official" for a service
you cannot observe. Build-time and AI-time are the expensive, failure-prone
moments; without metrics and structured logs, every incident is a mystery and
every cost spike is a surprise.

---

### W9 — Trust, onboarding & polish  (P1)

**Current gap.** The app ships Next.js placeholder favicon, metadata, and
assets; sidebar shows fake user "John Doe / Free Plan" (`WorkspaceLayout.tsx:
128-142`); Navbar has dead Share/Settings buttons; no onboarding, empty states
beyond raw text, no landing page, no ToS/privacy, no LICENSE file in the repo.

**Required work**
- Real product name + logo/favicon + title/description (today:
  "Flutter Cloud Builder | Build Apps with AI", default favicon).
- Onboarding: sign-in CTA → first "create a project" → guided first edit/build
  (exploit the A.4 #1 target).
- Empty states and error states for every screen (projects empty, workspace
  dead, AI down, build failed with readable diagnostics).
- Privacy policy + ToS reflecting that user code executes on our infra; content
  abuse reporting path.
- Repo LICENSE (decide OSS vs source-available) + `CONTRIBUTING` if public.

**Why this makes it a good product.** Developer tools win on first-run feel and
on the small signals of seriousness (no default favicon, no fake user card).
Legal + license clarity removes the reasons a professional won't paste their app
idea into the box.

---

### W10 — Docs accuracy & hygiene  (P2)

**Current gap.** `README.md` (§2.2 API contract) and `docs/API.md` don't cover
endpoints added after they were written: `GET /raw`, `DELETE /file`,
`POST /file/rename`, `POST /folder`, and the whole dev-server family
(`/dev/start|hot-reload|stop|logs` — `server.py:279-335`). `.env`/config
documentation assumes the old single-workspace model.

**Required work**
- Update README + API + ARCHITECTURE for: auth model, project endpoints,
  dev-server endpoints, env/secret handling, single-node deployment, and the
  W4 run-mode semantics (hot reload vs release build).
- Document the release/run instructions for the v1 SaaS topology (not just
  local docker-compose).

**Why this makes it a good product.** Docs are the contract between the team and
its future self (and any early user trying to self-host). Drift here is how the
20-issue review happened in the first place.

---

## Part C — Sequencing, milestones & risks

### C.1 Milestones (dependency-ordered)

| # | Milestone | Contains | Exit criteria |
| - | --------- | -------- | ------------- |
| M0 | Baseline freeze | Tag current state; snapshot TESTING.md as regression seed | Clean `git tag`; CI scaffold running tests on the *current* behavior |
| M1 | Identity + projects | W1, W3 | Sign in; create/list/rename/delete projects; ownership enforced; no wid-only access |
| M2 | Isolation + preview | W2, W4 | Sandboxed builds; scrubbed env (no secrets in children); hot-reload preview behind proxy; quotas + GC in place |
| M3 | AI writes code | W5 | Prompt → validated files in workspace → app builds; fallback path works; cost caps enforced |
| M4 | Reliability + quality | W6, W7, W8, W10 | Tests + scans green in CI; metrics + structured logs live; money-path E2E passes |
| M5 | Trust + beta | W9, G0.7 | Landing, legal, onboarding live; ≥ 20 external beta users for 2 weeks; GA bug list cleared |

Dependencies: M1 → M2 (isolation needs ownership), M2 → M3 (AI writes to owned,
sandboxed projects), everything feeds M4; M5 overlaps M4. W7 tooling starts at
M0 (it guards every later change).

### C.2 Top risks

1. **Isolation cost/complexity (W2).** Running arbitrary Dart + `pub` deps safely
   is the hardest engineering on the list. Mitigate: start with the strictest
   simple sandbox (per-project ephemeral containers + network allowlist) rather
   than a clever-but-complex one; validate with a public bug-bounty-ish push
   during beta.
2. **AI output reliability (W5).** LLM-generated Dart will not always compile.
   Mitigate: deterministic fallback, schema validation, good error surfacing,
   and framing in the UI ("AI scaffolds; you own the code"), plus a curated
   "known-good templates" library as the fallback content.
3. **Build latency kills the core promise (W4).** If hot-reload preview isn't
   reliably fast, the product regresses to "slow build server." Mitigate: make
   W4 the top UX priority, measure A.4 #2 from M2 onward, and cut scope rather
   than ship a slow release-build-only experience.
4. **Costs (AI + Flutter builds).** Gemini calls and CPU-heavy builds scale with
   usage but not revenue (free v1). Mitigate: quotas from day one (W2), model
   tiering that already exists, per-user caps, and monitoring (W8) before the
   beta cohort grows.

### C.3 Open questions for the team to resolve during M0

- Product **name** and repo visibility (public OSS vs private) → affects W9/W10.
- OAuth providers for v1 (Google/GitHub) vs email magic-link first.
- Single-node instance sizing (vCPU/RAM/disk) and whether v1 runs on one VM or
  one k8s namespace.

---

## Appendix — Design principles to keep through v1

1. The **edit → live preview loop** is the product; never let another feature
   degrade it.
2. User code and model output are **untrusted**; validate at every boundary.
3. Secrets reach build processes **never**; they reach only the server process
   that needs them.
4. Everything a user makes is **exportable**; lock-in is the anti-feature.
5. The docs (README/API/ARCHITECTURE/TESTING) stay **in sync with code** in the
   same PRs that change behavior.
