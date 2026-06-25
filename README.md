# CodeForge

Self-hosted technical assessment platform for **app-development hiring** — create coding/MCQ
assessments, invite candidates via expiring links, run their code in a sandboxed Judge0 engine,
and review auto-scored results.

**Current status: Phase 2 (Integrity Layer) complete** — everything from Phase 1 (recruiter auth,
DSA + MCQ question bank with versioning, test builder, candidate flow with server-authoritative
timer and autosave/resume, sandboxed grading pipeline, results/review UI) plus:

- **Proctoring events**: tab/window switches, fullscreen exits (with lock-in overlay), blocked
  copy/paste at lockdown level, devtools heuristic, multi-monitor detection — all stored as a
  timestamped per-session timeline. Configurable thresholds **force-submit server-side**.
- **Webcam snapshots** (strict/lockdown): random-interval captures + identity photo, stored in
  MinIO/S3 (never Postgres), face-presence check via the browser FaceDetector API where available,
  recruiter gallery via presigned URLs. Audio is *not* recorded (permission check only), and the
  candidate-facing disclosure says exactly what is captured per level.
- **Session replay**: keystroke-level editor deltas recorded per coding question; recruiters can
  replay how a solution was typed, with paste-like block inserts (≥120 chars) marked on the
  timeline — and detected server-side, so the client can't hide them.
- **Integrity Score** (0–100): weighted, capped deductions per event type with a full breakdown.
  Presented everywhere as *a signal for human review, never a verdict*; nothing auto-rejects.
- **Plagiarism engine** (MOSS/JPlag family): comment-stripping + identifier-normalizing tokenizer,
  k-gram fingerprints with winnowing, starter-template subtraction, pairwise comparison within a
  question's cohort plus a per-question **reference corpus** ("found it online" flagged separately
  from collusion), side-by-side diff view with matched ranges highlighted. Runs automatically when
  a session finishes; full re-scan on demand.

Phases 3–5 (app-dev challenge types, analytics/exports, hardening) remain.

---

## Monorepo layout

```
codeforge/
├── apps/
│   ├── api/            Express + TypeScript REST API, Prisma, BullMQ workers
│   │   ├── prisma/     schema.prisma (full Section-7 data model) + seed
│   │   └── src/
│   │       ├── routes/       auth, users, questions, tests, invitations, candidate, results
│   │       ├── services/     grading (Judge0), session lifecycle, config parsing
│   │       ├── jobs/         queues + processors (grade, auto-submit, sweep)
│   │       ├── middleware/   RBAC auth, candidate-token auth, validation, rate limits
│   │       └── lib/          judge0 client, tokens, email, logging, errors
│   └── web/            Next.js 15 (App Router) + Tailwind 4 + Monaco
│       └── src/app/
│           ├── (dash)/       recruiter UI: dashboard, question bank, tests, session review
│           └── t/[token]/    candidate flow: identity → instructions → test → confirmation
├── packages/shared/    types, zod schemas, language map, scoring helpers (used by both apps)
├── docker-compose.yml  Postgres, Redis, MinIO, Judge0 (isolated network), optional app profile
├── judge0.conf         Judge0 configuration (network egress disabled for submissions)
└── SECURITY.md         sandbox & network-isolation model
```

## Architecture

```
                 ┌────────────┐   /api rewrite    ┌─────────────┐
  Candidate ────▶│  Next.js   │──────────────────▶│  Express API │◀──── Recruiter (JWT + refresh cookie)
  (link token)   │  apps/web  │                   │  apps/api    │
                 └────────────┘                   └──────┬──────┘
                                                         │ Prisma
                                              ┌──────────┼──────────────┐
                                              ▼          ▼              ▼
                                         PostgreSQL    Redis ◀──── BullMQ workers
                                                       (queue)    grade / auto-submit / sweep
                                                                        │ REST (base64)
                                                                        ▼
                                                          Judge0 server + workers (isolate
                                                          sandbox, own network + own DB/Redis,
                                                          no egress from submissions)
```

**Grading pipeline (DSA):** candidate hits *Submit* → a `Submission` row is created (`queued`)
and a `grade-submission` job is enqueued → the worker sends all test cases to Judge0 as a batch,
polls for verdicts, stores per-case `JudgeResult` rows (verdict, stdout, stderr, time, memory)
and computes the score server-side (weighted partial credit unless disabled). *Run* executes only
the visible sample cases synchronously. MCQs are scored deterministically at finalize time.

**Timer & auto-submit:** the deadline lives on the session (`endsAt`, set server-side at start).
A delayed BullMQ job fires at the deadline and finalizes the session; a repeatable sweep job is
the safety net; the client timer is display-only. Un-submitted coding drafts are promoted to
submissions at finalize so a crash/timeout never loses work.

**Candidate links:** opaque 256-bit tokens, single-session, revocable, with an identity
confirmation step that locks the link after 5 email mismatches.

---

## Local setup

Prereqs: Node 20+, Docker Desktop.

```bash
cd codeforge
cp .env.example .env          # then change the JWT secrets + seed admin password
docker compose up -d          # Postgres :5433, Redis :6380, MinIO :9000, Judge0 :2358
npm install                   # installs workspaces, builds packages/shared
npm run db:migrate            # prisma migrate dev
npm run db:seed               # org + admin + demo question bank + published demo test
npm run dev:api               # API on :4000 (workers run in-process in dev)
npm run dev:web               # Next.js on :3000  (separate terminal)
```

Sign in at `http://localhost:3000/login` with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
(defaults: `admin@codeforge.local` / `admin1234!`).

**Try the full loop:** Tests → *App Dev Intern Screen — Demo* → Invitations → add
`Your Name, you@example.com` → copy the generated link → open it in a private window →
confirm identity with that email → take the test → watch the Results tab.

Email delivery uses a console driver in Phase 1: invitation emails are logged by the API,
and every link is copyable from the Invitations tab.

### Code execution: Judge0 vs the local-dev fallback

Judge0's `isolate` sandbox requires **cgroup v1 memory controllers**. Recent WSL2 kernels
(6.12+, e.g. the one Docker Desktop uses today) have removed cgroup-v1 memory support
entirely, so Judge0 workers cannot execute code there — submissions come back as
`Internal Error`. The old `.wslconfig` `kernelCommandLine` workaround no longer works on
those kernels.

For local development on such machines, set in `.env`:

```ini
EXECUTOR=docker
```

This switches the grading pipeline to a **dev-only fallback executor** that runs each test
case in an ephemeral, hardened container on your local Docker daemon (`--network none`,
memory/CPU/pids limits, read-only rootfs, non-root; js / python / c / cpp / java). Same
API, same verdicts, same scoring path. **Production deployments should always run
`EXECUTOR=judge0`** on a Linux host whose kernel still ships cgroup v1 (or with the
cgroup-v1 boot flags) — see SECURITY.md for why Judge0's isolate is the stronger sandbox.

Everything else (MCQ flow, autosave, results) works without any executor; coding
runs/submissions return a friendly "runner unavailable" message and grading jobs retry
with backoff until the executor is reachable.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev:worker` | run queue workers as a separate process (set `WORKER_INLINE=false`) |
| `npm run typecheck` | typecheck api + web |
| `npm run db:migrate` | create/apply dev migrations |
| `node scripts/smoke-phase1.mjs` | end-to-end smoke test of the core flow (needs api + infra up) |
| `node scripts/smoke-phase2.mjs` | end-to-end smoke test of the integrity layer |
| `docker compose --profile app up -d --build` | run api + worker + web in containers too |

---

## Privacy & proctoring notes (Phase 2)

- Candidates see a per-level disclosure of exactly what is monitored *before* consenting to
  start; nothing is monitored at level `none`.
- Webcam snapshots live in the private MinIO/S3 bucket, viewable only by staff via short-lived
  presigned URLs. There is no automatic retention/deletion policy yet — delete a session (or the
  bucket prefix `sessions/<id>/`) to purge its media; a lifecycle policy is planned for Phase 5.
- The face-presence check is exactly that — "is a face visible" — **not** biometric identity
  matching, and the UI never claims otherwise (spec Section 10).
- The Integrity Score and plagiarism percentages are decision *inputs*: the recruiter UI labels
  them as signals and keeps the raw timeline/diff one click away.

## Notes & limitations

- **Question versioning:** editing a question that has submissions creates a new version;
  historical results stay pinned to the old version; draft tests re-point automatically.
- **Question pools** exist in the schema and session resolver; the builder UI for pools arrives
  with Phase 4 polish.
- **Reviewer role** currently has org-wide read access (per-test scoping lands in Phase 2 with
  the review workflow).
- "Flag for review" marks are per-browser UI state; answers themselves are server-persisted.
- Monaco loads its assets from a CDN by default; Phase 5 pins/self-hosts them.
- Proctoring levels can be configured on a test now but only take effect in Phase 2.

## Roadmap

- ~~**Phase 2 — Integrity:** proctoring events, winnowing-based plagiarism engine, integrity
  score, keystroke session replay.~~ Done.
- **Phase 3 — App-dev differentiators:** sandboxed live-preview frontend challenges with visual
  diff + DOM assertions (Playwright + pixelmatch), API-challenge grading harness, repo
  clone/build/test pipeline in an egress-restricted worker pool.
- **Phase 4 — Recruiter polish:** cohort analytics, CSV/PDF export, real email provider,
  branding, reviewer rubrics, pool-builder UI.
- **Phase 5 — Hardening:** load tests, security review, accessibility pass, observability,
  snapshot retention policy.
