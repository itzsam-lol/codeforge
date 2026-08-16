#!/usr/bin/env node
/**
 * Provisions the fixture data for a real concurrency test: logs in as the
 * seeded admin, picks (or creates) a published test, invites N candidates,
 * and writes their raw tokens to a CSV that candidate-flow.yml consumes via
 * Artillery's payload feature.
 *
 * Usage: node scripts/load-test/setup.mjs [count]   (default 20 — matches
 * verify-identity's per-IP rate limit ceiling, see README.md, so the default
 * run works out of the box from a single machine without tripping it)
 */
import { writeFileSync } from "node:fs";

const API = process.env.LOAD_TEST_API_ORIGIN ?? "http://localhost:4000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@codeforge.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234!";
const COUNT = Number(process.argv[2] ?? 20);

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log(`Logging in as ${ADMIN_EMAIL}...`);
  const { accessToken } = await api("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  console.log("Finding a published test with questions...");
  const { tests } = await api("/api/tests", { token: accessToken });
  const target = tests.find((t) => t.status === "published" && t.counts.questions > 0);
  if (!target) throw new Error("No published test with questions found — publish one first.");
  console.log(`Using test "${target.title}" (${target.id}), duration ${target.durationMinutes}min`);

  console.log(`Creating ${COUNT} invitations...`);
  const candidates = Array.from({ length: COUNT }, (_, i) => ({
    name: `Load Test Candidate ${i}`,
    email: `load-test-${Date.now()}-${i}@example.com`,
  }));
  const { created, skipped } = await api(`/api/tests/${target.id}/invitations`, {
    method: "POST",
    token: accessToken,
    body: { candidates },
  });
  if (skipped.length > 0) console.warn(`${skipped.length} invitations were skipped (duplicate emails?)`);

  // name/email must round-trip through verify-identity's own check
  // (email must exactly match the invitation's candidateEmail) — the CSV
  // carries them per-row instead of the scenario hardcoding one shared
  // identity for every virtual user.
  const rows = created.map((c) => {
    const token = c.link.split("/t/")[1];
    return `${token},${c.name},${c.email}`;
  });
  const csv = ["token,name,email", ...rows].join("\n") + "\n";
  writeFileSync(new URL("./tokens.csv", import.meta.url), csv);

  writeFileSync(
    new URL("./run-meta.json", import.meta.url),
    JSON.stringify({ testId: target.id, invitationIds: created.map((c) => c.id), createdAt: new Date().toISOString() }, null, 2)
  );

  console.log(`Wrote ${rows.length} tokens to scripts/load-test/tokens.csv`);
  console.log("Run the load test with: npm run load-test  (from repo root)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
