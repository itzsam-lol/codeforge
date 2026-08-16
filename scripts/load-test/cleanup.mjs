#!/usr/bin/env node
/** Revokes every invitation setup.mjs created for the most recent run. */
import { readFileSync, existsSync } from "node:fs";

const API = process.env.LOAD_TEST_API_ORIGIN ?? "http://localhost:4000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@codeforge.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234!";

const metaUrl = new URL("./run-meta.json", import.meta.url);
if (!existsSync(metaUrl)) {
  console.log("No run-meta.json found — nothing to clean up.");
  process.exit(0);
}
const meta = JSON.parse(readFileSync(metaUrl, "utf8"));

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const { accessToken } = await api("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  console.log(`Revoking ${meta.invitationIds.length} load-test invitations from test ${meta.testId}...`);
  let revoked = 0;
  for (const id of meta.invitationIds) {
    await api(`/api/invitations/${id}/revoke`, { method: "POST", token: accessToken }).catch(() => undefined);
    revoked++;
  }
  console.log(`Revoked ${revoked} invitations. Sessions/submissions remain for inspection — delete manually if desired.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
