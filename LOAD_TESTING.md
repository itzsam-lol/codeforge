# CodeForge: Load Testing

`node scripts/load-test.mjs` (requires the API + infra running) drives a small, dependency-free
concurrent load against the endpoints that matter for a real hiring round: staff auth, staff
dashboard reads, and the candidate concurrency path (identity/start/autosave/submit). It is not a
k6/autocannon rig — the interesting bottleneck here isn't raw HTTP throughput (Express handles
that trivially) but the grading pipeline's queue/worker concurrency and, as this run found, a
CPU-bound library on the auth path.

## What it found, and what got fixed

**bcrypt was blocking the event loop.** The API used `bcryptjs` (a pure-JS bcrypt implementation)
for password hashing. `bcryptjs`'s "async" API doesn't use a real thread pool — the CPU-bound hash
comparison still runs on Node's single main thread, so concurrent login attempts serialize and
delay *every other request* being handled at the same time, not just auth.

| | 20 concurrent logins |
|---|---|
| Before (`bcryptjs`) | wall 4086ms, p50 4077ms, **4.9 req/s** |
| After (`bcrypt`, native, libuv threadpool) | wall 989ms, p50 598ms, **20.2 req/s** |

Fix: swapped `bcryptjs` → `bcrypt` (native addon, offloads hashing to libuv's threadpool so it
doesn't block request handling). Same hash format (`$2b$...`), so existing password hashes in the
database kept working with zero migration. Verified with the full smoke suite (login, wrong-
password rejection, and everything downstream of auth) before and after.

## Baseline numbers (this dev machine, `EXECUTOR=docker`)

| Path | Concurrency | Result |
|---|---|---|
| Staff results read (`GET /tests/:id/results`) | 30 | p50 93ms, p95 98ms, 293 req/s |
| Candidate verify-identity + start | 15 distinct candidates | p50 45ms, 298 req/s |
| Candidate autosave draft | 15 candidates × 5 keystrokes | p50 87ms, 165 req/s |
| DSA submission → fully graded | 15 concurrent submissions | **51.4s total, 0.29 graded/sec** |

Everything except grading has massive headroom on a single small API instance — the JSON CRUD
paths are not the bottleneck for a normal hiring-round cohort size (tens to low hundreds of
candidates).

## The real bottleneck: grading concurrency, not raw throughput

Grading is deliberately serialized to a small worker pool (`concurrency: 2` on the `grade` queue,
`apps/api/src/jobs/processors.ts`) because each DSA test case spins up a real container (Judge0's
`isolate`, or the `EXECUTOR=docker` dev fallback). 15 submissions took 51.4s end-to-end on this dev
machine's Docker fallback, roughly matching "a submission's test cases run serially inside one
worker slot, two slots run at once."

This number is **not representative of production**: `EXECUTOR=docker` is an explicitly-labeled
dev-only fallback (see README "Judge0 vs the local-dev fallback"); the code path in front of it
(routes, queue dispatch, DB writes) is unchanged between dev and prod, so the *shape* of this
result generalizes even though the *number* doesn't.

**To scale grading throughput in production:**
1. Run real `EXECUTOR=judge0` on a Linux host with cgroup v1 — Judge0's `isolate` sandbox is
   materially faster per-submission than spinning up a full Docker container per test case.
2. Raise `concurrency` on the `grade` Worker (`processors.ts`) — bounded by Judge0's own worker
   count (`docker-compose.yml`'s `judge0-workers` service, itself horizontally scalable) or, for
   `EXECUTOR=docker`, by the host's CPU/memory headroom for concurrent containers.
3. Run grading workers as a separate process/host (`WORKER_INLINE=false`, `npm run dev:worker` /
   the compose `worker` service) so a grading burst never competes with the API process for CPU —
   they're stateless and horizontally scalable independent of the API (see SECURITY.md
   "Scalability").
4. Phase 3 app-dev graders (frontend/API/bug-fix/repo) are heavier still (a browser or full
   container per submission) — their queue already runs at `concurrency: 2` for the same reason;
   scale that pool the same way (more workers, not more concurrency per worker, since each grader
   already saturates a CPU core).

## Running it yourself

```bash
docker compose up -d
npm run dev:api      # or npm run dev:worker separately
node scripts/load-test.mjs
```

Uses the seeded `App Dev Intern Screen: Demo` test and creates throwaway candidate invitations
(`load+<timestamp>+N@test.local`) — harmless to leave in a dev database, same pattern as the
`smoke-phase*.mjs` suites.
