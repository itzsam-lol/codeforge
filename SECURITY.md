# CodeForge — Security Model

## Untrusted code isolation

Candidate-submitted code **never executes inside the application processes**. All execution goes
through Judge0 CE, which runs each submission inside the `isolate` sandbox (Linux namespaces +
cgroups): resource-limited (CPU time, wall time, memory, process count) and with **no network
access** (`ENABLE_NETWORK=false`, and `ALLOW_ENABLE_NETWORK=false` so per-submission overrides are
rejected).

Network segmentation (docker-compose):

- `app_net` — Postgres, Redis, MinIO, API, web.
- `judge0_net` — Judge0 server + workers + Judge0's **own private** Postgres/Redis.

Only the API/worker containers bridge both networks. A sandbox escape inside a Judge0 worker
still lands in a network segment with no route to the application database, Redis, or secrets.
Judge0's API port (2358) is only published to localhost for development; in production keep it
unpublished and reachable solely over `judge0_net`.

Phase 3's repo/API-challenge workers (which must `npm install` and run real servers) will run in
a **separate, more locked-down pool** (registry-allowlist egress only), never in Judge0 and never
on `app_net`.

### Dev-only fallback executor (`EXECUTOR=docker`)

Where Judge0 can't run (kernels ≥6.12 without cgroup-v1 memory, e.g. current Docker
Desktop/WSL2), a development fallback executes each test case in an ephemeral container:
`--network none`, `--memory`/`--cpus`/`--pids-limit` caps, `--read-only` rootfs with a small
`exec` tmpfs for compilers, non-root user, wall-clock kill, output truncation. That is
meaningful container-level isolation, but it is **weaker than isolate** (shared kernel attack
surface, no per-syscall policy) and runs on the developer's daemon — it must never be enabled
on a production deployment. The API's `/healthz` reports which executor is active.

## Authentication & authorization

- **Staff:** short-lived JWT access tokens (~15 min) + rotating opaque refresh tokens stored as
  SHA-256 hashes in Postgres, delivered in an `httpOnly` `SameSite=Lax` cookie scoped to
  `/api/auth`. Login compares against a dummy bcrypt hash for unknown emails (uniform timing).
- **RBAC is middleware-enforced on every route**, not UI-hidden: `super_admin`/`recruiter` for
  authoring and score overrides, `reviewer` read-only, and every query is scoped by the
  authenticated user's `organization_id`.
- **Candidates:** no accounts. Opaque 256-bit random capability tokens in emailed links —
  server-side validated, expiring, revocable, bound to one invitation/session, and locked after
  5 failed identity confirmations. (Stored raw per the product requirement that recruiters can
  re-copy links; hash-at-rest is a planned Phase 5 hardening once links are re-sendable by email.)

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
- The candidate client can only report an allowlisted set of event types with size-capped
  metadata; penalized signals that matter (large pastes) are **derived server-side** from the
  editor delta stream, so a tampered client can't suppress them. Threshold enforcement
  (force-submit) also runs server-side against server-stored counts.
- Face-presence is a boolean heuristic, never biometric identification, and the UI says so.

## Known gaps (tracked for Phase 5)

- Access token cached in `localStorage` (XSS-readable). Mitigations today: sanitized Markdown is
  the only user-authored HTML path, 15-minute expiry. Plan: move to in-memory only.
- Judge0 runs unauthenticated inside its isolated network; enable `AUTHN_TOKEN` when the port is
  exposed beyond localhost.
- No audit log of staff actions yet; structured logs exist for grading/session jobs.
