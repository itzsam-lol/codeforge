# CodeForge

Self-hosted technical assessment platform for **app-development hiring**: create coding/MCQ
assessments, invite candidates via expiring links, run their code in a sandboxed Judge0 engine,
and review auto-scored results.

**Current status: Phases 1–5 complete (the full original roadmap).** Phase 1 shipped recruiter auth, a DSA + MCQ question bank
with versioning, the test builder, a candidate flow with a server-authoritative timer and
autosave/resume, a sandboxed grading pipeline, and a results/review UI. Phase 2 added:

- **Proctoring events**: tab/window switches, fullscreen exits (with lock-in overlay), blocked
  copy/paste at lockdown level, devtools heuristic, multi-monitor detection, all stored as a
  timestamped per-session timeline. Configurable thresholds **force-submit server-side**.
- **Webcam snapshots** (strict/lockdown): random-interval captures + identity photo, stored in
  MinIO/S3 (never Postgres), face-presence check via the browser FaceDetector API where available,
  recruiter gallery via presigned URLs. Audio is *not* recorded (permission check only), and the
  candidate-facing disclosure says exactly what is captured per level.
- **Session replay**: keystroke-level editor deltas recorded per coding question; recruiters can
  replay how a solution was typed, with paste-like block inserts (≥120 chars) marked on the
  timeline; these are detected server-side, so the client can't hide them.
- **Integrity Score** (0–100): weighted, capped deductions per event type with a full breakdown.
  Presented everywhere as *a signal for human review, never a verdict*; nothing auto-rejects.
- **Plagiarism engine** (MOSS/JPlag family): comment-stripping + identifier-normalizing tokenizer,
  k-gram fingerprints with winnowing, starter-template subtraction, pairwise comparison within a
  question's cohort plus a per-question **reference corpus** ("found it online" flagged separately
  from collusion), side-by-side diff view with matched ranges highlighted. Runs automatically when
  a session finishes; full re-scan on demand.

**Phase 3 (App-Dev Differentiators) complete**: all six question types now author, deliver, and
grade end-to-end:

- **Frontend UI challenge**: split-pane editor with a live sandboxed `<iframe>` preview
  (`sandbox="allow-scripts"`, console piped back to the UI). Graded by **visual diff**: headless
  Chromium (Playwright) renders the candidate's HTML/CSS at each breakpoint and compares
  pixel-by-pixel (pixelmatch) against a server-rendered reference screenshot, plus **DOM
  assertions** and **Playwright interaction tests**. Reviewer sees reference / candidate / diff
  images side by side. The reference HTML/CSS never leaves the server.
- **API / backend challenge**: candidate writes a Node HTTP server; it runs in a container attached
  to a per-run `--internal` Docker network (no egress, no published port) while a harness on the
  same network fires the scripted HTTP sequence and asserts status / body / JSON-path per test.
- **Bug-fix challenge**: broken multi-file project with file tabs; a hidden `node --test` suite runs
  in a network-less container and must go from failing to passing.
- **Repo submission**: shallow clone → install → build → test in a container, plus git-history
  metadata (commit count, generic-message heuristic, timing spread) and optional Playwright
  screenshots of the running app. A candidate "Validate" button does a dry-run clone first.

**Phase 4 (Recruiter Polish & Analytics) complete**:

- **Cohort analytics**: score-distribution histogram, per-question pass rate / average score, and
  average time spent per question, on a new Analytics tab per test.
- **CSV / PDF export**: the full results table, one click, from the Results tab. PDF is rendered
  server-side with the same headless Chromium already used for Phase 3 grading.
- **Bulk candidate triage**: checkbox-select rows in Results and shortlist / tag in bulk.
- **Reviewer rubric**: manual 1–5 sliders (code organization, UI polish, completeness) alongside
  the automated sub-scores, for repo-submission and UI-visual questions; one note per reviewer,
  visible to the rest of the panel.
- **Question pools**: a builder UI in the Questions tab lets a recruiter group interchangeable
  bank questions into a pool and add it as a test slot; each candidate gets one random,
  session-frozen pick (spec 3.3).
- **CSV bulk invite**: upload a `.csv` (or paste) of `name,email` rows on the Invitations tab.
- **Transactional email**: a real templated-email path (`EMAIL_DRIVER=resend`, Resend HTTP API,
  no SDK) alongside the console driver, plus a 24h-before-expiry reminder sweep, a candidate
  submission-confirmation email, and a one-time "results ready" email to the test's owner once
  every invitation reaches a terminal state.
- **Org branding**: a Settings page for logo / accent color / display name, applied on the
  candidate-facing landing, identity, and start pages.

Phase 5 (hardening) complete: see the "Hardening (Phase 5)" section of `SECURITY.md`,
`LOAD_TESTING.md`, and `scripts/a11y-scan.mjs`.

**White-label branding, expanded further for reselling** (see "Selling CodeForge to a client"
below): logo, dark-mode logo, favicon, tagline, accent color (+ auto-derived hover shade), support
email, privacy-policy link, and a `hideCodeForgeBranding` switch that removes every "CodeForge"
mention product-wide. Applied consistently across the **recruiter login page, dashboard sidebar,
browser tab title/favicon, and the entire candidate flow including the in-test header** — not
just the candidate landing page.

---

## Monorepo layout

```
codeforge/
├── apps/
│   ├── api/            Express + TypeScript REST API, Prisma, BullMQ workers
│   │   ├── prisma/     schema.prisma (full Section-7 data model) + seed
│   │   └── src/
│   │       ├── routes/       auth, users, org, questions, tests, invitations, candidate, results
│   │       ├── services/     grading (Judge0), session lifecycle, config parsing, notifications
│   │       ├── jobs/         queues + processors (grade, auto-submit, sweep, reminders)
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

**Try the full loop:** Tests → *App Dev Intern Screen: Demo* → Invitations → add
`Your Name, you@example.com` → copy the generated link → open it in a private window →
confirm identity with that email → take the test → watch the Results tab.

Email delivery uses a console driver in Phase 1: invitation emails are logged by the API,
and every link is copyable from the Invitations tab.

### Code execution: Judge0 vs the local-dev fallback

Judge0's `isolate` sandbox requires **cgroup v1 memory controllers**. Recent WSL2 kernels
(6.12+, e.g. the one Docker Desktop uses today) have removed cgroup-v1 memory support
entirely, so Judge0 workers cannot execute code there. Submissions come back as
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
cgroup-v1 boot flags); see SECURITY.md for why Judge0's isolate is the stronger sandbox.

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
| `node scripts/smoke-phase3.mjs` | end-to-end smoke test of the app-dev challenge graders |
| `node scripts/smoke-phase4.mjs` | end-to-end smoke test of analytics/export/rubric/pools/branding |
| `node scripts/a11y-scan.mjs` | axe-core WCAG A/AA scan across every recruiter page + candidate flow |
| `node scripts/load-test.mjs` | basic load test (auth, staff reads, candidate concurrency, grading throughput); see `LOAD_TESTING.md` |
| `npx playwright install chromium -w @codeforge/api` | install the headless browser (Phase 3 grading) |
| `docker compose --profile app up -d --build` | run api + worker + web in containers too |

---

## Selling CodeForge to a client

CodeForge is built to be resold as **one fully white-labeled, self-hosted deployment per client**,
not a shared multi-tenant SaaS: each client gets their own instance (own database, own domain, own
env file), and every visible trace of "CodeForge" can be replaced with their brand. There is no
signup flow, billing system, or cross-client isolation to configure, because there is exactly one
organization per install by design (see `packages/shared/src/index.ts`'s `brandingConfigSchema`
comment). This keeps a new client's onboarding to configuration, not code changes.

### New client checklist

1. **Provision infrastructure**: a fresh Postgres/Redis/MinIO (or reuse the provided
   `docker-compose.yml` on the client's own host/VM), and a Judge0 instance if going to
   production (`EXECUTOR=judge0`; see "Judge0 vs the local-dev fallback" below).
2. **Copy `.env.example` to `.env`** and set, at minimum: `DATABASE_URL`, `REDIS_URL`,
   `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (32+ chars, unique per client, see
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), `WEB_ORIGIN`/
   `API_ORIGIN` (the client's real domain, not localhost), `EMAIL_DRIVER=resend` +
   `RESEND_API_KEY` + `EMAIL_FROM` (the client's own sending domain), `SEED_ORG_NAME` and
   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (the client's first admin account).
3. **Run migrations + seed** (`npm run db:migrate && npm run db:seed`), then sign in as that
   admin and open **Settings**.
4. **Set branding** in Settings: display name, tagline, logo, favicon, accent color, support
   email, privacy-policy link, and turn on **"Hide all CodeForge branding"**. This single toggle
   is the switch between "CodeForge, white-labeled" and "looks like the client's own product,
   full stop" — it suppresses every default wordmark and the "Powered by CodeForge" attribution
   line across the login page, dashboard sidebar, browser tab, and the entire candidate flow
   (landing, identity, in-test header, confirmation).
5. **Point their domain** at the deployment (reverse proxy / TLS termination in front of the
   `web` and `api` containers is outside this repo's scope, since it's environment-specific).
6. **Seed their real question bank**: the shipped seed data (`prisma/seed.ts`) is a demo set for
   evaluating the platform, not meant to go live for a client's actual hiring round — replace it
   with the client's own questions via the Question Bank UI, or write a client-specific seed
   script following the same pattern.

### What deliberately isn't built (and why)

- **No self-serve org signup or billing** — out of scope for the per-client self-hosted model;
  see the multi-tenant-SaaS alternative noted in code comments if that model is ever needed later
  (the schema is already org-scoped throughout, so it wouldn't require a data-model rewrite, just
  auth/tenancy-boundary work that doesn't exist today).
- **No license-key/usage-gating mechanism** — commercial terms are a business/legal concern for
  however CodeForge is licensed to a given client, not something the running application enforces.
- **Recruiter-dashboard accent color is not yet re-themeable** — logo, name, favicon, and tab
  title are white-labeled throughout the recruiter side, but internal UI elements (buttons,
  badges, active-tab highlights) keep a fixed indigo accent rather than following the client's
  `accentColor`. The **candidate-facing flow is fully accent-themed** (this is the side that
  reflects on the client's brand externally, so it got priority); extending the same treatment to
  the recruiter dashboard's internals would mean replacing hardcoded Tailwind `indigo-*` classes
  across ~20 components with a CSS-variable-driven equivalent — a larger, lower-priority follow-up
  since recruiters are the client's own internal hiring team, not an external audience.

---

## Privacy & proctoring notes (Phase 2)

- Candidates see a per-level disclosure of exactly what is monitored *before* consenting to
  start; nothing is monitored at level `none`.
- Webcam snapshots live in the private MinIO/S3 bucket, viewable only by staff via short-lived
  presigned URLs. A daily sweep deletes each snapshot's image once it's past
  `SNAPSHOT_RETENTION_DAYS` (default 90, `0` disables it); the timeline entry survives, image-less.
- The face-presence check is exactly that ("is a face visible"), **not** biometric identity
  matching, and the UI never claims otherwise (spec Section 10).
- The Integrity Score and plagiarism percentages are decision *inputs*: the recruiter UI labels
  them as signals and keeps the raw timeline/diff one click away.

## Notes & limitations

- **Question versioning:** editing a question that has submissions creates a new version;
  historical results stay pinned to the old version; draft tests re-point automatically.
- **Reviewer rubric** is one set of sliders + a note per (session, reviewer) pair, not
  per-question, matching the Section 7 data model (`ReviewNote` has no `questionId`).
- **Reviewer role** currently has org-wide read access; per-test scoping (assigning a reviewer to
  specific tests only) is a future improvement, not part of the Phase 5 scope.
- "Flag for review" marks are per-browser UI state; answers themselves are server-persisted.
- Monaco loads its assets from a CDN by default; Phase 5 pins/self-hosts them.
- Proctoring levels can be configured on a test now but only take effect in Phase 2.
- The `resend` email driver is a real HTTP integration but needs `RESEND_API_KEY`; without one
  set, `EMAIL_DRIVER=resend` silently falls back to the console driver per-send.

## Roadmap

- ~~**Phase 2: Integrity.** proctoring events, winnowing-based plagiarism engine, integrity
  score, keystroke session replay.~~ Done.
- ~~**Phase 3: App-dev differentiators.** sandboxed live-preview frontend challenges with visual
  diff + DOM assertions (Playwright + pixelmatch), API-challenge grading harness, repo
  clone/build/test pipeline.~~ Done.
- ~~**Phase 4: Recruiter polish.** cohort analytics, CSV/PDF export, real email provider,
  branding, reviewer rubrics, pool-builder UI.~~ Done.
- ~~**Phase 5: Hardening.** load tests, security review, accessibility pass, observability,
  snapshot retention policy, egress-restricted repo-grading worker pool.~~ Done: see
  `LOAD_TESTING.md`, the "Hardening (Phase 5)" section of `SECURITY.md`, `scripts/a11y-scan.mjs`
  (0 WCAG A/AA violations), the Activity page (staff audit log), `SNAPSHOT_RETENTION_DAYS`, and
  the repo-grading pool's allowlist egress proxy.
