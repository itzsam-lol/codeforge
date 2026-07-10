/**
 * CodeForge Phase-2 smoke test — integrity layer end-to-end:
 * lockdown test → 2 candidates → proctoring events (threshold force-submit),
 * editor replay stream + server paste detection, webcam snapshot to MinIO,
 * integrity score/timeline, plagiarism scan (collusion pair + reference match).
 */
const API = "http://localhost:4000";
const ADMIN = { email: "admin@codeforge.local", password: "admin1234!" };

let failures = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) failures++;
};
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
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

// ---------------------------------------------------------------- staff setup
const login = await req("/api/auth/login", { method: "POST", body: ADMIN });
const token = login.json.accessToken;
ok("admin login", login.status === 200);

const REF_SOLUTION = [
  'const s = require("fs").readFileSync(0, "utf8").replace(/\\r?\\n$/, "");',
  "function lengthOfLongestSubstring(s) {",
  "  const map = new Map();",
  "  let left = 0, best = 0;",
  "  for (let right = 0; right < s.length; right++) {",
  "    const ch = s[right];",
  "    if (map.has(ch) && map.get(ch) >= left) left = map.get(ch) + 1;",
  "    map.set(ch, right);",
  "    best = Math.max(best, right - left + 1);",
  "  }",
  "  return best;",
  "}",
  "console.log(lengthOfLongestSubstring(s));",
].join("\n");

// A question with a reference corpus entry.
const q = await req("/api/questions", {
  method: "POST", token,
  body: {
    type: "dsa",
    title: "P2 Longest Substring (proctored)",
    bodyMd: "Length of the longest substring without repeating characters. One line in, integer out.",
    difficulty: "medium",
    tags: ["phase2"],
    typeConfig: {
      languages: ["javascript"],
      starterCode: { javascript: '// read stdin, print answer\n' },
      timeLimitMs: 2000,
      memoryLimitKb: 128000,
      referenceSolutions: [{ label: "Canonical sliding-window (public)", code: REF_SOLUTION }],
    },
    testCases: [
      { input: "abcabcbb", expectedOutput: "3", isHidden: false, weight: 1 },
      { input: "bbbbb", expectedOutput: "1", isHidden: true, weight: 1 },
      { input: "pwwkew", expectedOutput: "3", isHidden: true, weight: 1 },
    ],
  },
});
ok("question created", q.status === 201);
const questionId = q.json.question.id;

const t = await req("/api/tests", {
  method: "POST", token,
  body: {
    title: "P2 Integrity Screen",
    durationMinutes: 30,
    proctoringLevel: "lockdown",
    settings: { maxTabSwitches: 3, maxFullscreenExits: 3, partialCredit: true },
  },
});
ok("lockdown test created", t.status === 201);
const testId = t.json.test.id;
await req(`/api/tests/${testId}/questions`, {
  method: "PUT", token, body: { items: [{ questionId, points: 30 }] },
});
const pub = await req(`/api/tests/${testId}/publish`, { method: "POST", token });
ok("test published", pub.status === 200);

const stamp = Date.now();
const inv = await req(`/api/tests/${testId}/invitations`, {
  method: "POST", token,
  body: {
    candidates: [
      { name: "Cand A", email: `p2a+${stamp}@test.local` },
      { name: "Cand B", email: `p2b+${stamp}@test.local` },
    ],
  },
});
ok("2 invitations created", inv.json?.created?.length === 2);
const [candA, candB] = inv.json.created.map((c) => ({
  token: c.link.split("/t/")[1],
  email: c.email,
  name: c.name,
}));

// context exposes proctoring config
const ctxA = await req("/api/candidate/context", { candidateToken: candA.token });
ok(
  "context exposes lockdown limits",
  ctxA.json?.proctoring?.level === "lockdown" &&
    ctxA.json?.proctoring?.limits?.maxTabSwitches === 3 &&
    ctxA.json?.proctoring?.webcamRequired === true
);

async function startCandidate(cand) {
  await req("/api/candidate/verify-identity", {
    method: "POST", candidateToken: cand.token, body: { name: cand.name, email: cand.email },
  });
  const s = await req("/api/candidate/start", { method: "POST", candidateToken: cand.token });
  return s.status === 200;
}
ok("candidate A started", await startCandidate(candA));
ok("candidate B started", await startCandidate(candB));

// ------------------------------------------------- candidate A: full journey
// Webcam snapshot (tiny valid JPEG header padded — server only checks size).
const fakeJpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(400, 0x20),
  Buffer.from([0xff, 0xd9]),
]).toString("base64");
const snap = await req("/api/candidate/snapshot", {
  method: "POST", candidateToken: candA.token,
  body: { imageBase64: `data:image/jpeg;base64,${fakeJpeg}`, facePresent: false, kind: "interval" },
});
ok("snapshot stored (MinIO) + face_absent flagged", snap.status === 201);

// Editor events: init op, then a large paste (>=120 chars) → server heuristic.
const ev1 = await req("/api/candidate/editor-events", {
  method: "POST", candidateToken: candA.token,
  body: {
    questionId,
    ops: [
      { t: 0, o: 0, d: 0, i: "// read stdin, print answer\n", init: true },
      { t: 4000, o: 28, d: 0, i: REF_SOLUTION }, // one-block paste of the whole solution
    ],
  },
});
ok("editor events stored + paste detected", ev1.status === 200);

// Proctoring events: 2 tab switches (under limit 3) → warning, not submit.
const evts1 = await req("/api/candidate/events", {
  method: "POST", candidateToken: candA.token,
  body: { events: [{ type: "tab_switch" }, { type: "tab_switch" }] },
});
ok(
  "under-limit switches warn but don't submit",
  evts1.status === 200 && evts1.json.forceSubmitted === false && evts1.json.warnings.length > 0,
  JSON.stringify(evts1.json.warnings)
);

// Candidate A submits code ≈ the reference solution (plagiarism: reference hit).
const subA = await req(`/api/candidate/questions/${questionId}/submit`, {
  method: "POST", candidateToken: candA.token,
  body: { code: REF_SOLUTION, language: "javascript" },
});
ok("A submitted", subA.status === 201);

// 2 more tab switches → total 4 > 3 → forced auto-submit.
const evts2 = await req("/api/candidate/events", {
  method: "POST", candidateToken: candA.token,
  body: { events: [{ type: "tab_switch" }, { type: "tab_switch" }] },
});
ok("threshold breach force-submits", evts2.status === 200 && evts2.json.forceSubmitted === true);

const ctxAfter = await req("/api/candidate/context", { candidateToken: candA.token });
ok("A session auto_submitted", ctxAfter.json?.session?.status === "auto_submitted");

// -------------------------------------- candidate B: colludes (same code)
const subB = await req(`/api/candidate/questions/${questionId}/submit`, {
  method: "POST", candidateToken: candB.token,
  body: { code: REF_SOLUTION.replace(/map/g, "seen").replace(/best/g, "ans"), language: "javascript" },
});
ok("B submitted (renamed identifiers)", subB.status === 201);
const finB = await req("/api/candidate/finish", { method: "POST", candidateToken: candB.token });
ok("B finished", finB.status === 200);

// ---------------------------------------------------------- recruiter review
console.log("      waiting for grading + plagiarism jobs…");
await sleep(15000);

const results = await req(`/api/tests/${testId}/results`, { token });
const rowA = results.json.sessions.find((s) => s.candidateEmail === candA.email);
const rowB = results.json.sessions.find((s) => s.candidateEmail === candB.email);
ok("A integrity score reduced", rowA?.integrityScore != null && rowA.integrityScore < 100,
  `integrity=${rowA?.integrityScore}`);
ok("plagiarism pct on results rows", (rowA?.plagiarismMaxPct ?? 0) >= 70 || (rowB?.plagiarismMaxPct ?? 0) >= 70,
  `A=${rowA?.plagiarismMaxPct}% B=${rowB?.plagiarismMaxPct}%`);

const integ = await req(`/api/sessions/${rowA.sessionId}/integrity`, { token });
ok("integrity endpoint: score + deductions", integ.status === 200 && integ.json.integrity.deductions.length >= 2,
  JSON.stringify(integ.json.integrity));
ok("timeline includes auto-submit + paste",
  integ.json.timeline.some((e) => e.type === "integrity_auto_submit") &&
  integ.json.timeline.some((e) => e.type === "large_paste"));
ok("snapshot gallery with presigned URL + face_absent",
  integ.json.snapshots.length === 1 && integ.json.snapshots[0].url.includes("X-Amz-Signature") &&
  integ.json.snapshots[0].facePresent === false);

const replay = await req(`/api/sessions/${rowA.sessionId}/replay/${questionId}`, { token });
ok("replay batches retrievable", replay.status === 200 && replay.json.batches.length >= 1 &&
  replay.json.batches[0].ops.some((op) => op.init));

const plag = await req(`/api/tests/${testId}/plagiarism`, { token });
const kinds = new Set((plag.json?.reports ?? []).map((r) => r.kind));
const candidatePair = plag.json.reports.find((r) => r.kind === "candidate");
const refHit = plag.json.reports.find((r) => r.kind === "reference");
ok("candidate-pair collusion flagged despite renamed identifiers",
  Boolean(candidatePair) && candidatePair.similarityPct >= 70,
  `${candidatePair?.similarityPct}%`);
ok("reference (public source) match flagged separately",
  Boolean(refHit) && refHit.similarityPct >= 70,
  `${refHit?.similarityPct}% (${refHit?.b?.referenceLabel})`);
ok("both kinds present", kinds.has("candidate") && kinds.has("reference"));

if (candidatePair) {
  const detail = await req(`/api/plagiarism/${candidatePair.reportId}`, { token });
  ok("side-by-side detail with matched ranges",
    detail.status === 200 && detail.json.report.matchedRanges.length > 0 &&
    typeof detail.json.report.a.content === "string" && typeof detail.json.report.b.content === "string");
}

// Full re-scan trigger
const scan = await req(`/api/tests/${testId}/plagiarism-scan`, { method: "POST", token });
ok("manual full scan queues", scan.status === 202);

// Candidate must never see integrity endpoints
const leak = await req(`/api/sessions/${rowA.sessionId}/integrity`);
ok("integrity endpoint requires staff auth", leak.status === 401);

console.log(failures === 0 ? "\nALL PHASE-2 SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
