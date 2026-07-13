/**
 * CodeForge basic load test (spec 8: "load-test the Judge0/grading worker
 * pools"). Not a k6/autocannon setup — a small, dependency-free concurrent
 * request driver, since the interesting bottleneck here isn't raw HTTP
 * throughput (Express handles that trivially) but the grading pipeline's
 * queue/worker concurrency. Requires the API + infra up.
 *
 * NOTE: on this dev machine EXECUTOR=docker (the local-dev fallback, see
 * SECURITY.md / README "Judge0 vs the local-dev fallback"), which spawns a
 * real container per test case. Numbers here characterize that path, NOT
 * production Judge0 throughput — the isolate sandbox on a proper Linux host
 * is materially faster and horizontally scalable independent of the API.
 */
const API = "http://localhost:4000";
const ADMIN = { email: "admin@codeforge.local", password: "admin1234!" };

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarize(label, timings, errors, wallMs) {
  const sorted = [...timings].sort((a, b) => a - b);
  const n = timings.length;
  console.log(`\n=== ${label} ===`);
  console.log(`  n=${n} errors=${errors} wall=${wallMs}ms throughput=${(n / (wallMs / 1000)).toFixed(1)}/s`);
  if (n > 0) {
    console.log(
      `  p50=${percentile(sorted, 50).toFixed(0)}ms p95=${percentile(sorted, 95).toFixed(0)}ms ` +
        `p99=${percentile(sorted, 99).toFixed(0)}ms max=${sorted[n - 1].toFixed(0)}ms`
    );
  }
}

async function timed(fn) {
  const start = performance.now();
  try {
    await fn();
    return { ok: true, ms: performance.now() - start };
  } catch {
    return { ok: false, ms: performance.now() - start };
  }
}

async function runConcurrent(label, count, fn) {
  const wallStart = performance.now();
  const results = await Promise.all(Array.from({ length: count }, () => timed(fn)));
  const wallMs = performance.now() - wallStart;
  const timings = results.filter((r) => r.ok).map((r) => r.ms);
  const errors = results.filter((r) => !r.ok).length;
  summarize(label, timings, errors, wallMs);
  return { timings, errors, wallMs };
}

async function apiJson(p, opts = {}) {
  const res = await fetch(API + p, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok && opts.allowFail !== true) throw new Error(`${p} -> ${res.status}`);
  return res.json();
}

console.log("CodeForge load test starting...");

// ---- 1. Auth throughput (bcrypt-bound; the one intentionally slow hash op) ----
const login = await apiJson("/api/auth/login", { method: "POST", body: ADMIN });
const token = login.accessToken;
async function apiAuth(p, opts = {}) {
  return apiJson(p, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) } });
}

await runConcurrent("Login (20 concurrent, bcrypt cost)", 20, () =>
  fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
  })
);

// ---- 2. Staff dashboard read load ----
const tests = await apiAuth("/api/tests");
const demo = tests.tests.find((t) => t.title.startsWith("App Dev Intern"));
await runConcurrent("Staff results read (30 concurrent)", 30, () =>
  fetch(`${API}/api/tests/${demo.id}/results`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
    if (!r.ok) throw new Error(String(r.status));
  })
);

// ---- 3. Candidate concurrency: N candidates verify+start simultaneously ----
const N = 15;
const emails = Array.from({ length: N }, (_, i) => `load+${Date.now()}+${i}@test.local`);
const inv = await apiAuth(`/api/tests/${demo.id}/invitations`, {
  method: "POST",
  body: { candidates: emails.map((email, i) => ({ name: `Load ${i}`, email })) },
});
const ctokens = inv.created.map((c) => c.link.split("/t/")[1]);

let idx = 0;
await runConcurrent(`Candidate verify+start (${N} concurrent, distinct candidates)`, N, async () => {
  const i = idx++;
  const ct = ctokens[i];
  await fetch(`${API}/api/candidate/verify-identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-candidate-token": ct },
    body: JSON.stringify({ name: `Load ${i}`, email: emails[i] }),
  });
  const startRes = await fetch(`${API}/api/candidate/start`, {
    method: "POST",
    headers: { "x-candidate-token": ct },
  });
  if (!startRes.ok) throw new Error(String(startRes.status));
});

// ---- 4. Autosave draft concurrency (the highest-frequency candidate call) ----
const states = await Promise.all(
  ctokens.map((ct) => fetch(`${API}/api/candidate/state`, { headers: { "x-candidate-token": ct } }).then((r) => r.json()))
);
const dsaQ = states[0].questions.find((q) => q.type === "dsa");

await runConcurrent(`Autosave draft (${N} concurrent candidates x 5 keystrokes each)`, N, async () => {
  const i = Math.floor(Math.random() * N);
  const ct = ctokens[i];
  for (let k = 0; k < 5; k++) {
    const res = await fetch(`${API}/api/candidate/questions/${dsaQ.questionId}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-candidate-token": ct },
      body: JSON.stringify({ content: `// keystroke ${k}\nfunction f(){}`, language: "javascript" }),
    });
    if (!res.ok) throw new Error(String(res.status));
  }
});

// ---- 5. Grading pipeline throughput: N concurrent DSA submissions ----
const submitStart = performance.now();
await Promise.all(
  ctokens.map((ct, i) =>
    fetch(`${API}/api/candidate/questions/${dsaQ.questionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-candidate-token": ct },
      body: JSON.stringify({
        code: "const s=require('fs').readFileSync(0,'utf8').trim();console.log(s.length);",
        language: "javascript",
      }),
    })
  )
);
// Submit is `isFinal: false` until the session finishes (real candidates
// only finalize once); finish each session so the submission actually
// enters the grading queue as the one that counts, matching real usage.
await Promise.all(ctokens.map((ct) => fetch(`${API}/api/candidate/finish`, { method: "POST", headers: { "x-candidate-token": ct } })));
console.log(`\n=== Grading pipeline: ${N} DSA submissions queued+finished in ${(performance.now() - submitStart).toFixed(0)}ms ===`);
console.log("      polling for all to finish grading (this is the EXECUTOR=docker dev path, not production Judge0)...");

const deadline = Date.now() + 180_000;
let gradedCount = 0;
const gradeStart = performance.now();
while (Date.now() < deadline) {
  const results = await apiAuth(`/api/tests/${demo.id}/results`);
  const rows = results.sessions.filter((s) => emails.includes(s.candidateEmail));
  gradedCount = rows.filter((s) => !s.gradingPending).length;
  if (gradedCount >= N) break;
  await new Promise((r) => setTimeout(r, 3000));
}
const gradeMs = performance.now() - gradeStart;
console.log(
  `  graded ${gradedCount}/${N} submissions in ${(gradeMs / 1000).toFixed(1)}s ` +
    `(${(gradedCount / (gradeMs / 1000)).toFixed(2)} submissions/sec, EXECUTOR=docker, worker concurrency=2)`
);

console.log("\nLoad test complete.");
