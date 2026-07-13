/**
 * CodeForge Phase-4 smoke test: recruiter polish & analytics.
 * Cohort analytics, CSV/PDF export, bulk shortlist/tag, reviewer rubric
 * notes, org branding, and question pools. Requires the API + infra up.
 */
const API = "http://localhost:4000";
const ADMIN = { email: "admin@codeforge.local", password: "admin1234!" };

let failures = 0;
const ok = (n, c, e = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${e ? "  - " + e : ""}`); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(path, { method = "GET", body, token, candidateToken, raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(candidateToken ? { "x-candidate-token": candidateToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const login = await req("/api/auth/login", { method: "POST", body: ADMIN });
const token = login.json.accessToken;
ok("admin login", login.status === 200);

const tests = (await req("/api/tests", { token })).json.tests;
const showcase = tests.find((t) => t.title.startsWith("App Dev Skills"));
ok("showcase test found", Boolean(showcase));

// ---------------------------------------------------------------------------
// Org branding
// ---------------------------------------------------------------------------
const orgBefore = (await req("/api/org", { token })).json.org;
ok("org GET returns branding", Boolean(orgBefore));
const putBrand = await req("/api/org", {
  method: "PUT", token,
  body: { displayName: "Smoke Test Org", accentColor: "#123456" },
});
ok("org PUT saves branding", putBrand.status === 200 && putBrand.json.org.branding.accentColor === "#123456");

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
const analytics = await req(`/api/tests/${showcase.id}/analytics`, { token });
ok("analytics endpoint 200", analytics.status === 200);
ok(
  "analytics has score distribution + per-question stats",
  Array.isArray(analytics.json?.scoreDistribution) &&
    analytics.json.scoreDistribution.length === 10 &&
    Array.isArray(analytics.json?.perQuestion),
  JSON.stringify(analytics.json).slice(0, 150)
);

// ---------------------------------------------------------------------------
// CSV / PDF export
// ---------------------------------------------------------------------------
const csvRes = await req(`/api/tests/${showcase.id}/results/export.csv`, { token, raw: true });
const csvText = await csvRes.text();
ok(
  "CSV export ok + has header row",
  csvRes.status === 200 &&
    csvRes.headers.get("content-type")?.includes("text/csv") &&
    csvText.startsWith("Name,Email,Status"),
  csvText.slice(0, 60)
);

console.log("      rendering PDF export (Playwright)…");
const pdfRes = await req(`/api/tests/${showcase.id}/results/export.pdf`, { token, raw: true });
const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
ok(
  "PDF export ok + looks like a PDF",
  pdfRes.status === 200 &&
    pdfRes.headers.get("content-type") === "application/pdf" &&
    pdfBuf.subarray(0, 5).toString() === "%PDF-",
  `size=${pdfBuf.length}`
);

// ---------------------------------------------------------------------------
// Bulk shortlist / tag (invite + complete a throwaway candidate first)
// ---------------------------------------------------------------------------
const email = `p4+${Date.now()}@test.local`;
const inv = await req(`/api/tests/${showcase.id}/invitations`, {
  method: "POST", token, body: { candidates: [{ name: "P4 Candidate", email }] },
});
ok("invitation created", inv.status === 201);
const ct = inv.json.created[0].link.split("/t/")[1];
await req("/api/candidate/verify-identity", { method: "POST", candidateToken: ct, body: { name: "P4 Candidate", email } });
await req("/api/candidate/start", { method: "POST", candidateToken: ct });
await req("/api/candidate/finish", { method: "POST", candidateToken: ct });

const results = await req(`/api/tests/${showcase.id}/results`, { token });
const row = results.json.sessions.find((s) => s.candidateEmail === email);
ok("results row includes shortlisted/tags fields", row && "shortlisted" in row && "tags" in row);

const bulkShortlist = await req(`/api/tests/${showcase.id}/sessions/bulk`, {
  method: "POST", token, body: { sessionIds: [row.sessionId], action: "shortlist" },
});
const bulkTag = await req(`/api/tests/${showcase.id}/sessions/bulk`, {
  method: "POST", token, body: { sessionIds: [row.sessionId], action: "addTag", tag: "strong-candidate" },
});
ok("bulk shortlist + tag succeed", bulkShortlist.status === 200 && bulkTag.status === 200);

const resultsAfter = await req(`/api/tests/${showcase.id}/results`, { token });
const rowAfter = resultsAfter.json.sessions.find((s) => s.candidateEmail === email);
ok(
  "shortlist + tag persisted",
  rowAfter?.shortlisted === true && rowAfter?.tags.includes("strong-candidate"),
  JSON.stringify(rowAfter)
);

// ---------------------------------------------------------------------------
// Reviewer rubric notes
// ---------------------------------------------------------------------------
const putNote = await req(`/api/sessions/${row.sessionId}/review-notes`, {
  method: "PUT", token,
  body: { rubricScores: { codeOrganization: 4, uiPolish: 5, completeness: 3 }, note: "Solid work overall." },
});
ok("review-notes PUT succeeds", putNote.status === 200);
const getNotes = await req(`/api/sessions/${row.sessionId}/review-notes`, { token });
ok(
  "review-notes GET returns saved rubric",
  getNotes.status === 200 &&
    getNotes.json.notes.some((n) => n.rubricScores.uiPolish === 5 && n.note === "Solid work overall."),
  JSON.stringify(getNotes.json)
);

// ---------------------------------------------------------------------------
// Question pools (spec 3.3) on a fresh draft test
// ---------------------------------------------------------------------------
const bank = (await req("/api/questions", { token })).json.questions;
const mcqQs = bank.filter((q) => q.type === "mcq").slice(0, 2);
ok("at least 2 MCQ questions in bank for a pool", mcqQs.length === 2);

const draftTest = await req("/api/tests", {
  method: "POST", token,
  body: { title: `Pool smoke test ${Date.now()}`, durationMinutes: 30 },
});
ok("draft test created", draftTest.status === 201);
const draftId = draftTest.json.test.id;

const poolCreate = await req(`/api/tests/${draftId}/pools`, {
  method: "POST", token,
  body: { name: "Warm-up variants", questionIds: mcqQs.map((q) => q.id) },
});
ok("pool created", poolCreate.status === 201);
const poolId = poolCreate.json.pool.id;

const poolsGet = await req(`/api/tests/${draftId}/pools`, { token });
ok("pool listed", poolsGet.status === 200 && poolsGet.json.pools.some((p) => p.id === poolId));

const slotSave = await req(`/api/tests/${draftId}/questions`, {
  method: "PUT", token,
  body: { items: [{ poolId, points: 10 }] },
});
ok("pool added as test slot", slotSave.status === 200);

const draftFull = await req(`/api/tests/${draftId}`, { token });
ok(
  "test slot resolves back to the pool",
  draftFull.json.test.questions.length === 1 && draftFull.json.test.questions[0].poolId === poolId
);

const poolDelete = await req(`/api/tests/${draftId}/pools/${poolId}`, { method: "DELETE", token });
ok("pool deleted (slot cascades)", poolDelete.status === 200);
await req(`/api/tests/${draftId}`, { method: "DELETE", token }); // archive the scratch test

// ---------------------------------------------------------------------------
// Cleanup: restore original branding
// ---------------------------------------------------------------------------
await req("/api/org", {
  method: "PUT", token,
  body: {
    displayName: orgBefore.branding.displayName,
    logoUrl: orgBefore.branding.logoUrl,
    accentColor: orgBefore.branding.accentColor,
  },
});

console.log(failures === 0 ? "\nALL PHASE-4 SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
