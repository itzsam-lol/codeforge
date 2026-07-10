/**
 * CodeForge Phase-1 smoke test — drives the real API end-to-end:
 * login → invite → candidate identity → start → MCQ answers → coding submit
 * (if Judge0 is up) → finish → recruiter results + session detail.
 */
const API = "http://localhost:4000";
const ADMIN = { email: "admin@codeforge.local", password: "admin1234!" };

let failures = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) failures++;
};

async function req(path, { method = "GET", body, token, candidateToken } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(candidateToken ? { "x-candidate-token": candidateToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- staff side
const health = await req("/healthz");
ok("healthz responds", health.status === 200, JSON.stringify(health.json));
const judge0Up = Boolean(health.json?.services?.executorHealthy);

const login = await req("/api/auth/login", { method: "POST", body: ADMIN });
ok("admin login", login.status === 200 && Boolean(login.json?.accessToken));
const token = login.json.accessToken;

const badLogin = await req("/api/auth/login", { method: "POST", body: { email: ADMIN.email, password: "wrong" } });
ok("wrong password rejected", badLogin.status === 401);

const noAuth = await req("/api/questions");
ok("questions route requires auth", noAuth.status === 401);

const tests = await req("/api/tests", { token });
const demo = tests.json?.tests?.find(
  (t) => t.status === "published" && t.title.startsWith("App Dev Intern Screen")
);
ok("demo test exists (published)", Boolean(demo), demo?.title);

const email = `smoke+${Date.now()}@test.local`;
const invite = await req(`/api/tests/${demo.id}/invitations`, {
  method: "POST",
  token,
  body: { candidates: [{ name: "Smoke Candidate", email }] },
});
ok("invitation created", invite.status === 201 && invite.json?.created?.length === 1);
const link = invite.json.created[0].link;
const candToken = link.split("/t/")[1];

// ------------------------------------------------------------ candidate side
const ctx = await req("/api/candidate/context", { candidateToken: candToken });
ok("candidate context loads", ctx.status === 200 && ctx.json?.test?.title === demo.title);

const badIdentity = await req("/api/candidate/verify-identity", {
  method: "POST", candidateToken: candToken,
  body: { name: "Smoke Candidate", email: "attacker@evil.com" },
});
ok("identity email mismatch rejected", badIdentity.status === 400);

const identity = await req("/api/candidate/verify-identity", {
  method: "POST", candidateToken: candToken,
  body: { name: "Smoke Candidate", email },
});
ok("identity verified", identity.status === 200);

const start = await req("/api/candidate/start", { method: "POST", candidateToken: candToken });
ok("session started with server deadline", start.status === 200 && Boolean(start.json?.session?.endsAt));

const state = await req("/api/candidate/state", { candidateToken: candToken });
const qs = state.json?.questions ?? [];
ok("state returns questions", qs.length === 6, `${qs.length} questions`);
const mcqs = qs.filter((q) => q.type === "mcq");
const dsas = qs.filter((q) => q.type === "dsa");
ok("no answer keys leak to candidate", !JSON.stringify(state.json).includes("correctOptionIds"));
ok("hidden cases stripped", dsas.every((q) => (q.sampleCases?.length ?? 0) <= 3));

// Answer MCQs: correct answers per seed = b, b, [a,c,d], a
const answerKey = {
  "HTTP status for resource creation": ["b"],
  "useEffect run-once semantics": ["b"],
  "Database index trade-offs": ["a", "c", "d"],
  "Flexbox main-axis centering": ["a"],
};
for (const q of mcqs) {
  const sel = answerKey[q.title] ?? [];
  const save = await req(`/api/candidate/questions/${q.questionId}/draft`, {
    method: "PUT", candidateToken: candToken,
    body: { content: JSON.stringify({ selectedOptionIds: sel }) },
  });
  ok(`autosave MCQ "${q.title.slice(0, 30)}…"`, save.status === 200);
}

// Coding: draft on Balanced Brackets (finalize should promote it), and if
// Judge0 is up, explicit submit on Longest Substring.
const brackets = dsas.find((q) => q.title === "Balanced Brackets");
const longest = dsas.find((q) => q.title.startsWith("Longest Substring"));

const BRACKETS_JS = `const s=require("fs").readFileSync(0,"utf8").replace(/\\r?\\n$/,"");
function isBalanced(s){const st=[];const m={")":"(","]":"[","}":"{"};for(const c of s){if("([{".includes(c))st.push(c);else if(")]}".includes(c)){if(st.pop()!==m[c])return false;}}return st.length===0;}
console.log(isBalanced(s)?"true":"false");`;

const LONGEST_JS = `const s=require("fs").readFileSync(0,"utf8").replace(/\\r?\\n$/,"");
function f(s){let best=0,start=0;const seen=new Map();for(let i=0;i<s.length;i++){const c=s[i];if(seen.has(c)&&seen.get(c)>=start)start=seen.get(c)+1;seen.set(c,i);best=Math.max(best,i-start+1);}return best;}
console.log(f(s));`;

const draftCode = await req(`/api/candidate/questions/${brackets.questionId}/draft`, {
  method: "PUT", candidateToken: candToken,
  body: { content: BRACKETS_JS, language: "javascript" },
});
ok("autosave code draft", draftCode.status === 200);

if (judge0Up) {
  const run = await req(`/api/candidate/questions/${longest.questionId}/run`, {
    method: "POST", candidateToken: candToken,
    body: { code: LONGEST_JS, language: "javascript" },
  });
  ok("Run executes sample cases", run.status === 200 && run.json?.results?.every((r) => r.passed),
    JSON.stringify(run.json?.results?.map((r) => r.verdict)));
  const sub = await req(`/api/candidate/questions/${longest.questionId}/submit`, {
    method: "POST", candidateToken: candToken,
    body: { code: LONGEST_JS, language: "javascript" },
  });
  ok("Submit queues grading", sub.status === 201);
} else {
  console.log("SKIP  Judge0 not reachable — coding run/submit skipped (drafts still promoted)");
}

const finish = await req("/api/candidate/finish", { method: "POST", candidateToken: candToken });
ok("finish submits session", finish.status === 200 && ["submitted", "auto_submitted"].includes(finish.json?.status));

const draftAfter = await req(`/api/candidate/questions/${brackets.questionId}/draft`, {
  method: "PUT", candidateToken: candToken,
  body: { content: "cheating-after-submit", language: "javascript" },
});
ok("edits after submit rejected", draftAfter.status === 403);

// ----------------------------------------------------------- recruiter side
if (judge0Up) { console.log("      waiting for grading jobs…"); await sleep(20000); }

const results = await req(`/api/tests/${demo.id}/results`, { token });
const row = results.json?.sessions?.find((s) => s.candidateEmail === email);
ok("results row exists", Boolean(row), `score=${row?.totalScore}/${row?.maxScore}`);
// MCQs: 5+5+5+5=20 expected. Coding adds up to 50 more when Judge0 graded both.
const expectedMin = 20;
ok("MCQ auto-scoring correct (>=20 pts from MCQs)", (row?.totalScore ?? 0) >= expectedMin);

const detail = await req(`/api/sessions/${row.sessionId}`, { token });
ok("session detail loads", detail.status === 200 && detail.json?.breakdown?.length === 6);
const bracketRow = detail.json.breakdown.find((b) => b.title === "Balanced Brackets");
ok("unsubmitted draft was promoted to a submission", Boolean(bracketRow?.finalSubmission));
if (judge0Up) {
  const longestRow = detail.json.breakdown.find((b) => b.title.startsWith("Longest"));
  ok("coding graded with judge results", (longestRow?.finalSubmission?.judgeResults?.length ?? 0) > 0,
    `score=${longestRow?.finalSubmission?.effectiveScore}`);
}

const override = await req(`/api/submissions/${bracketRow.finalSubmission.id}/score`, {
  method: "PATCH", token, body: { manualScore: 7 },
});
ok("manual score override", override.status === 200 && override.json?.submission?.effectiveScore === 7);

console.log(failures === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
