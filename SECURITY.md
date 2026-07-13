# CodeForge: Security Model

## Untrusted code isolation

Candidate-submitted code **never executes inside the application processes**. All execution goes
through Judge0 CE, which runs each submission inside the `isolate` sandbox (Linux namespaces +
cgroups): resource-limited (CPU time, wall time, memory, process count) and with **no network
access** (`ENABLE_NETWORK=false`, and `ALLOW_ENABLE_NETWORK=false` so per-submission overrides are
rejected).

Network segmentation (docker-compose):

- `app_net`: Postgres, Redis, MinIO, API, web.
- `judge0_net`: Judge0 server + workers + Judge0's **own private** Postgres/Redis.

Only the API/worker containers bridge both networks. A sandbox escape inside a Judge0 worker
still lands in a network segment with no route to the application database, Redis, or secrets.
Judge0's API port (2358) is only published to localhost for development; in production keep it
unpublished and reachable solely over `judge0_net`.

The repo-grading pool (which must `npm install` and run real servers) runs in a **separate,
more locked-down pool** (registry-allowlist egress only, see "Repo pipeline" below), never in
Judge0 and never on `app_net`.

### Phase 3 app-dev graders

- **Frontend UI**: candidate HTML/CSS/JS runs only inside headless Chromium with every network
  request aborted (`page.route` → abort non-`data:` URLs), and in the candidate's browser only
  inside an `<iframe sandbox="allow-scripts">` with no `allow-same-origin`, so it cannot read the
  parent app's cookies or storage. The reference HTML/CSS is recruiter-authored and never sent to
  candidates; only rendered screenshots (via presigned URLs) are.
- **API challenge**: the candidate server runs in a container on a per-run `docker network create
  --internal` network with no internet egress and no published host port. Only the harness container on
  that same network can reach it. Both containers are memory/CPU/pids-capped, non-root, read-only
  rootfs.
- **Bug-fix**: the hidden test suite runs in a `--network none` container; candidate file paths are
  path-traversal-checked before being written, and candidates can only overwrite starter-defined
  paths (no smuggling a replacement test file).
- **Repo pipeline**: clone/install/build/test run in a capped container with `GIT_TERMINAL_PROMPT=0`
  so a missing/private repo fails fast instead of hanging. This pool needs real egress for git +
  npm, unlike every other grader, so it gets a genuinely enforced allowlist instead of an
  unrestricted route: each run gets a fresh `docker network create --internal` network (no
  gateway to the internet at all) plus a small CONNECT-tunnel proxy container
  (`apps/api/docker/egress-proxy`, `lib/egressProxy.ts`) that's dual-homed onto that internal
  network *and* a normal internet-routed network. The grading container's only network is the
  internal one, with `HTTP(S)_PROXY` env vars pointing at the proxy; the proxy checks every
  `CONNECT`/request's target host against `GRADING_EGRESS_ALLOWLIST` (git hosts + npm registry by
  default) and returns 403 for anything else, closing the connection. Verified directly: a request
  to an allowlisted host succeeds, a request to an arbitrary host is blocked, and a request with no
  proxy configured at all fails outright (the internal network has no route to fail *through*).

### Dev-only fallback executor (`EXECUTOR=docker`)

Where Judge0 can't run (kernels ≥6.12 without cgroup-v1 memory, e.g. current Docker
Desktop/WSL2), a development fallback executes each test case in an ephemeral container:
`--network none`, `--memory`/`--cpus`/`--pids-limit` caps, `--read-only` rootfs with a small
`exec` tmpfs for compilers, non-root user, wall-clock kill, output truncation. That is
meaningful container-level isolation, but it is **weaker than isolate** (shared kernel attack
surface, no per-syscall policy) and runs on the developer's daemon; it must never be enabled
on a production deployment. The API's `/healthz` reports which executor is active.

## Authentication & authorization

- **Staff:** short-lived JWT access tokens (~15 min) + rotating opaque refresh tokens stored as
  SHA-256 hashes in Postgres, delivered in an `httpOnly` `SameSite=Lax` cookie scoped to
  `/api/auth`. Login compares against a dummy bcrypt hash for unknown emails (uniform timing).
  JWT signing secrets require a 32-character minimum, enforced at process startup.
- Staff email addresses are globally unique (one login identity per person, even across
  organizations), so a `POST /users` uniqueness check can confirm an email is already
  registered somewhere. This is only reachable by an authenticated `super_admin` and reveals
  no data beyond "taken," an accepted low-severity trade-off of the current single-identity
  user model.
- **RBAC is middleware-enforced on every route**, not UI-hidden: `super_admin`/`recruiter` for
  authoring and score overrides, `reviewer` read-only, and every query is scoped by the
  authenticated user's `organization_id`.
- **Candidates:** no accounts. Opaque 256-bit random capability tokens in emailed links, which are
  server-side validated, expiring, revocable, bound to one invitation/session, and locked after
  5 failed identity confirmations. (Stored raw per the product requirement that recruiters can
  re-copy links; hash-at-rest is a planned Phase 5 hardening once links are re-sendable by email.)
- **`GET /api/org/public`** is intentionally unauthenticated (it powers the pre-login page's
  wordmark and the browser tab title/favicon). It only ever returns `publicBrandingSchema`'s
  fields (name, tagline, logo/favicon URLs, accent colors, the white-label toggle), never
  `supportEmail`/`privacyUrl`/anything else in `brandingConfig` — all of which is content the
  client themselves configured for public display anyway, so there's no new information
  disclosure, just a pre-auth path to already-public-by-design branding.

## Scoring integrity

- Scores are **only** computed server-side from Judge0 verdicts / stored answer keys. No
  client-supplied score or verdict is ever persisted.
- The exam deadline is server-authoritative (`endsAt` on the session + a delayed auto-submit job
  + a sweep job). Client timers are cosmetic.
- Hidden test cases and MCQ answer keys are stripped from every candidate-facing response
  (`toCandidateQuestion`); recruiters see them via separate role-gated routes.
- stderr, compile output, and exit verdicts are captured per test case, so "no output" and
  "crashed" are distinguishable and auditable.

## Input handling & abuse controls

- All request bodies validated with zod; JSONB configs re-validated against per-type schemas.
- Recruiter-authored Markdown is rendered with `rehype-sanitize` on the client (stored-XSS
  defense for candidate-facing content).
- Rate limits: auth endpoints (30/15 min), candidate identity (20/15 min), code execution
  (30/min), and a global limiter; `helmet` for response headers; CORS restricted to the web
  origin with credentials.
- State-changing staff routes rely on Bearer tokens (immune to CSRF); the only cookie-authed
  route is the `SameSite=Lax`, path-scoped refresh endpoint.
- Program output stored from the judge is truncated (16 KB/stream) to prevent storage abuse.

## Proctoring data (Phase 2)

- Webcam snapshots are stored in the private S3/MinIO bucket under `sessions/<id>/`, served to
  staff only via 15-minute presigned URLs; raw storage keys are stripped from API responses.
- **Retention**: a daily sweep (`SNAPSHOT_RETENTION_DAYS`, default 90, `0` disables it) deletes
  the image from object storage once it's past the window; the proctoring-timeline entry itself
  is kept (so "a check happened at this timestamp" survives) with the storage key stripped and
  `purged: true` set, so a stale key is never served.
- The candidate client can only report an allowlisted set of event types with size-capped
  metadata; penalized signals that matter (large pastes) are **derived server-side** from the
  editor delta stream, so a tampered client can't suppress them. Threshold enforcement
  (force-submit) also runs server-side against server-stored counts.
- Face-presence is a boolean heuristic, never biometric identification, and the UI says so.

## Recruiter polish (Phase 4)

- **PDF export** renders a server-built HTML table (test title + result rows, all values escaped)
  with the same headless Chromium already sandboxed for Phase 3 grading; it never loads candidate-
  or recruiter-supplied HTML, so it carries none of the frontend-grader's untrusted-content risk.
- **Org branding** (`logoUrl`) is rendered as an `<img src>` on candidate pages, never as raw HTML,
  and `accentColor` is validated against a strict 6-hex-digit pattern server-side before storage.
- **CSV export** is generated field-by-field with `csvCell()`: any `"`, `,`, or newline is quoted
  and escaped, and any cell starting with `=`, `+`, `-`, or `@` (a candidate name/tag could be
  attacker-chosen) is tab-prefixed so it can't execute as a formula when the export is opened in
  Excel/Sheets (CSV formula-injection).
- **Bulk triage and review-notes routes** are staff-write-gated and re-check `orgId` on every
  session/test id, same as every other staff route.

## Hardening (Phase 5)

- **Structured request log**: every API request logs method/path/status/duration and the
  authenticated user (if any) via `middleware/requestLog.ts`.
- **Staff audit log**: sensitive actions (score override, invitation revoke, org branding update,
  question/test archive, test publish/close, staff user creation) are written to an `AuditLog`
  table (`services/audit.ts`, fire-and-forget, never blocks the underlying action) and visible to
  staff on the Activity page. Closes the gap noted below in earlier phases.
- **JWT secrets** now require a 32-character minimum (was 10), enforced at process startup.
- **Password hashing swapped from `bcryptjs` to native `bcrypt`**: load testing (`LOAD_TESTING.md`)
  found `bcryptjs`'s hash comparison runs synchronously on Node's single main thread despite its
  async-looking API, so concurrent logins serialized and delayed *every other request* being
  handled at the same time (20 concurrent logins: 4.9 req/s before, 20.2 req/s after switching to
  the native addon, which offloads to libuv's threadpool). Same hash format, so no data migration;
  verified against existing password hashes and the full smoke suite before deploying the swap.
- **Path-traversal guard fix**: the bug-fix/repo-project file-write guard in `dockerUtil.ts`
  compared paths with a bare `startsWith()`, which a sibling directory sharing the same string
  prefix could technically satisfy; it now compares against the resolved root plus a trailing
  separator. Not practically exploitable before the fix (the root is a randomly-suffixed
  `mkdtemp` directory), but the pattern itself was wrong and worth closing.
- **Accessibility**: automated `axe-core` scan (`scripts/a11y-scan.mjs`) across every recruiter
  page and the full candidate flow, 0 WCAG A/AA violations as of the last run. Fixed: body-text
  contrast (`slate-400` → `slate-500`/`slate-600`, several instances were below the 4.5:1 AA
  threshold), missing accessible names on filter `<select>`s and the problem-statement textarea,
  missing labels on bulk-select checkboxes, and a scrollable live-preview panel that wasn't
  keyboard-focusable.
- **Egress-restricted repo-grading worker pool**: see "Repo pipeline" above — the git-clone/
  npm-install containers now route through an allowlist-only forward proxy on a fresh `--internal`
  network per run, instead of having open internet egress. (The API-challenge and bug-fix pools
  already had no/no-internet egress from Phase 3; this closes the one grader that genuinely
  needed real internet access.)
- **Snapshot/media retention**: a configurable retention window (`SNAPSHOT_RETENTION_DAYS`) plus a
  repeatable sweep job now delete webcam snapshots and other session media past that window; see
  "Proctoring data" above.

## Known gaps (tracked beyond Phase 5)

- Access token cached in `localStorage` (XSS-readable). Mitigations today: sanitized Markdown is
  the only user-authored HTML path, 15-minute expiry. Plan: move to in-memory only.
- Judge0 runs unauthenticated inside its isolated network; enable `AUTHN_TOKEN` when the port is
  exposed beyond localhost.
- Candidate invitation tokens are stored raw (not hashed) so recruiters can re-copy links from the
  Invitations tab; hashing at rest would require reworking that UX (e.g. show the link once, or a
  regenerate-on-resend flow) — deferred.
- Staff email addresses are globally unique across organizations by design (one login identity),
  so an authenticated `super_admin` creating a user can learn whether an email is already
  registered elsewhere on the platform. Low-severity, accepted trade-off of the current
  single-identity user model.
