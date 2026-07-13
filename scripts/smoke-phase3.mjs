/**
 * CodeForge Phase-3 smoke test: app-dev challenge grading end-to-end:
 * frontend UI (visual diff + DOM assertions), API challenge (HTTP harness in
 * isolated network), bug-fix (node:test suite), and repo validation.
 * Requires Docker + Playwright Chromium.
 */
const API = "http://localhost:4000";
const ADMIN = { email: "admin@codeforge.local", password: "admin1234!" };

let failures = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${e ? "  - " + e : ""}`); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function pollGraded(token, testId, email, questionTitleStart, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const results = await req(`/api/tests/${testId}/results`, { token });
    const row = results.json.sessions.find((s) => s.candidateEmail === email);
    if (row) {
      const detail = await req(`/api/sessions/${row.sessionId}`, { token });
      const br = detail.json.breakdown.find((b) => b.title.startsWith(questionTitleStart));
      if (br?.finalSubmission && ["graded", "failed"].includes(br.finalSubmission.status)) {
        return { row, breakdown: detail.json.breakdown, br };
      }
    }
    await sleep(4000);
  }
  return null;
}

const login = await req("/api/auth/login", { method: "POST", body: ADMIN });
const token = login.json.accessToken;
ok("admin login", login.status === 200);

// Locate the seeded Phase 3 showcase test + trigger frontend reference render.
const tests = (await req("/api/tests", { token })).json.tests;
const showcase = tests.find((t) => t.title.startsWith("App Dev Skills"));
ok("showcase test seeded", Boolean(showcase));

const full = await req(`/api/tests/${showcase.id}`, { token });
const feTQ = full.json.test.questions.find((q) => q.question.type === "frontend_ui");
ok("frontend question present", Boolean(feTQ));

// Re-save the frontend question through the API so the reference-render job fires.
// A published test always keeps pointing at the question row it was published
// with (versioning invariant, spec 3.2) — a prior smoke run may have already
// superseded that row via an earlier re-save. In that case the reference
// screenshots it produced are still on the superseded row and still valid, so
// re-triggering the render isn't needed; only do it on a fresh (un-superseded) row.
const feFull = await req(`/api/questions/${feTQ.question.id}`, { token });
if (!feFull.json.question.supersededById) {
  const feResave = await req(`/api/questions/${feTQ.question.id}`, {
    method: "PUT", token,
    body: {
      type: "frontend_ui",
      title: feFull.json.question.title,
      bodyMd: feFull.json.question.bodyMd,
      difficulty: feFull.json.question.difficulty,
      tags: feFull.json.question.tags,
      typeConfig: feFull.json.question.typeConfig,
      testCases: [],
    },
  });
  ok("frontend question re-saved (triggers ref render)", feResave.status === 200);
  console.log("      rendering reference screenshots…");
  await sleep(12000);
} else {
  ok(
    "frontend question already versioned by a prior run; reusing its reference screenshots",
    Object.keys(feFull.json.question.typeConfig.referenceScreenshots ?? {}).length > 0
  );
}

// Invite one candidate to the showcase test.
const email = `p3+${Date.now()}@test.local`;
const inv = await req(`/api/tests/${showcase.id}/invitations`, {
  method: "POST", token, body: { candidates: [{ name: "P3 Candidate", email }] },
});
ok("invitation created", inv.status === 201);
const ct = inv.json.created[0].link.split("/t/")[1];

await req("/api/candidate/verify-identity", { method: "POST", candidateToken: ct, body: { name: "P3 Candidate", email } });
const start = await req("/api/candidate/start", { method: "POST", candidateToken: ct });
ok("session started", start.status === 200);

const state = await req("/api/candidate/state", { candidateToken: ct });
const qs = state.json.questions;
const feQ = qs.find((q) => q.type === "frontend_ui");
const apiQ = qs.find((q) => q.type === "api_challenge");
const bugQ = qs.find((q) => q.type === "bug_fix");
const repoQ = qs.find((q) => q.type === "repo_project");
ok("all 4 app-dev questions delivered", feQ && apiQ && bugQ && repoQ);
ok("frontend reference image URL delivered", Boolean(feQ.referenceImageUrls && Object.keys(feQ.referenceImageUrls).length > 0),
  JSON.stringify(Object.keys(feQ.referenceImageUrls || {})));
ok("frontend reference HTML NOT leaked", !JSON.stringify(feQ).includes("referenceHtml") && !JSON.stringify(feQ).includes("Unlock every feature"));
ok("api hidden tests NOT leaked", !JSON.stringify(apiQ).includes("expectBodyContains"));

// ---- Submit correct-ish solutions
// Frontend: near-perfect replica of the reference.
const feSolution = {
  html: '<section class="card"><h2>Go Pro</h2><p>Unlock every feature.</p><button>Upgrade</button></section>',
  css: "body{font-family:sans-serif;background:#f8fafc;margin:0;display:flex;justify-content:center;padding-top:60px}.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 10px 25px rgba(0,0,0,.08);text-align:center;max-width:320px}.card h2{margin:0 0 8px;font-size:24px}.card p{color:#64748b;margin:0 0 20px}.card button{background:#4f46e5;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:15px;cursor:pointer}",
  js: "",
};
ok("submit frontend", (await req(`/api/candidate/questions/${feQ.questionId}/submit`, {
  method: "POST", candidateToken: ct, body: { content: JSON.stringify(feSolution) },
})).status === 201);

// API: a correct bookmark server.
const apiSolution = `const http=require("http");const PORT=process.env.PORT||3000;let id=1;const items=[];
const server=http.createServer((req,res)=>{const send=(c,b)=>{res.writeHead(c,{"content-type":"application/json"});res.end(b==null?"":JSON.stringify(b));};
const m=req.url.match(/^\\/bookmarks\\/(.+)$/);
if(req.method==="GET"&&req.url==="/bookmarks")return send(200,items);
if(req.method==="POST"&&req.url==="/bookmarks"){let d="";req.on("data",c=>d+=c);req.on("end",()=>{let u="";try{u=JSON.parse(d||"{}").url||""}catch{}; const bm={id:id++,url:u};items.push(bm);send(201,bm);});return;}
if(req.method==="DELETE"&&m){const i=items.findIndex(x=>String(x.id)===m[1]);if(i>=0)items.splice(i,1);return send(204);}
send(404,{error:"not found"});});server.listen(PORT);`;
ok("submit api", (await req(`/api/candidate/questions/${apiQ.questionId}/submit`, {
  method: "POST", candidateToken: ct, body: { content: apiSolution },
})).status === 201);

// Bug fix: corrected cart.js.
const bugSolution = { files: { "cart.js":
`function total(items){let sum=0;for(let i=0;i<items.length;i++)sum+=items[i].price;return sum;}
function applyDiscount(items,pct){return items.map(it=>({...it,price:it.price*(1-pct)}));}
module.exports={total,applyDiscount};` } };
ok("submit bugfix", (await req(`/api/candidate/questions/${bugQ.questionId}/submit`, {
  method: "POST", candidateToken: ct, body: { content: JSON.stringify(bugSolution) },
})).status === 201);

// Repo: validate a small public repo (dry-run clone).
const repoVal = await req(`/api/candidate/questions/${repoQ.questionId}/validate-repo`, {
  method: "POST", candidateToken: ct, body: { url: "https://github.com/octocat/Hello-World" },
});
ok("repo validate (clone dry-run)", repoVal.status === 200 && repoVal.json.ok === true, repoVal.json.detail);
ok("repo submit accepts URL", (await req(`/api/candidate/questions/${repoQ.questionId}/submit`, {
  method: "POST", candidateToken: ct, body: { content: "https://github.com/octocat/Hello-World" },
})).status === 201);
// Reject a bad URL
const badRepo = await req(`/api/candidate/questions/${repoQ.questionId}/submit`, {
  method: "POST", candidateToken: ct, body: { content: "not-a-url" },
});
ok("repo submit rejects non-URL", badRepo.status === 400);

await req("/api/candidate/finish", { method: "POST", candidateToken: ct });
ok("session finished", true);

// ---- Wait for grading and assert per-type outcomes
console.log("      grading frontend (visual diff + assertions)…");
const fe = await pollGraded(token, showcase.id, email, "Centered Call");
ok("frontend graded", Boolean(fe), fe ? `score=${fe.br.finalSubmission.effectiveScore}/${fe.br.points}` : "timeout");
if (fe) {
  const jr = fe.br.finalSubmission.judgeResults;
  ok("frontend has visual diff results w/ presigned URLs",
    jr.some((r) => r.metadata?.kind === "visual" && typeof r.metadata.diffUrl === "string"));
  ok("frontend DOM assertions ran and passed",
    jr.filter((r) => r.metadata?.kind === "assertion").length >= 5 &&
    jr.filter((r) => r.metadata?.kind === "assertion" && r.passed).length >= 5);
  ok("frontend visual similarity high (replica)",
    jr.some((r) => r.metadata?.kind === "visual" && r.metadata.similarityPct >= 90),
    "sims=" + JSON.stringify(jr.filter(r=>r.metadata?.kind==="visual").map(r=>r.metadata.similarityPct)));
  ok("frontend score is high", fe.br.finalSubmission.effectiveScore >= 24);
}

console.log("      grading API challenge (isolated container network)…");
const apiG = await pollGraded(token, showcase.id, email, "Bookmark Manager");
ok("api graded", Boolean(apiG), apiG ? `score=${apiG.br.finalSubmission.effectiveScore}/${apiG.br.points}` : "timeout");
if (apiG) {
  const jr = apiG.br.finalSubmission.judgeResults;
  ok("api HTTP assertions ran", jr.filter((r) => r.metadata?.kind === "http").length >= 4);
  ok("api all HTTP tests passed", jr.filter((r) => r.metadata?.kind === "http").every((r) => r.passed),
    JSON.stringify(jr.filter(r=>r.metadata?.kind==="http").map(r=>({n:r.metadata.name,p:r.passed}))));
  ok("api score full", apiG.br.finalSubmission.effectiveScore >= 29);
}

console.log("      grading bug fix (node:test suite)…");
const bugG = await pollGraded(token, showcase.id, email, "Fix the Broken");
ok("bugfix graded", Boolean(bugG), bugG ? `score=${bugG.br.finalSubmission.effectiveScore}/${bugG.br.points}` : "timeout");
if (bugG) {
  const jr = bugG.br.finalSubmission.judgeResults;
  ok("bugfix ran 3 hidden tests, all pass", jr.filter((r) => r.metadata?.kind === "test").length === 3 &&
    jr.filter((r) => r.metadata?.kind === "test" && r.passed).length === 3);
  ok("bugfix full score", bugG.br.finalSubmission.effectiveScore === bugG.br.points);
}

console.log("      grading repo submission (clone+build+test+git meta)…");
const repoG = await pollGraded(token, showcase.id, email, "Mini Weather", 300000);
ok("repo graded", Boolean(repoG), repoG ? `score=${repoG.br.finalSubmission.effectiveScore}` : "timeout");
if (repoG) {
  const jr = repoG.br.finalSubmission.judgeResults;
  ok("repo pipeline steps recorded", jr.some((r) => r.metadata?.kind === "step" && r.metadata.step === "clone"));
  ok("repo git metadata surfaced", jr.some((r) => r.metadata?.kind === "git" && typeof r.metadata.commitCount === "number"));
}

console.log(failures === 0 ? "\nALL PHASE-3 SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
