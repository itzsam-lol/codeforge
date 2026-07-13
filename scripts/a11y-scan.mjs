/**
 * CodeForge accessibility scan (spec 8: WCAG contrast + keyboard nav): runs
 * axe-core (wcag2a/2aa/21a/21aa rules) against every recruiter page and the
 * full candidate flow. Requires the API + web dev servers running.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require2 = (await import("node:module")).createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "api", "package.json")
);
const { chromium } = require2("playwright");
const axeSource = fs.readFileSync(require2.resolve("axe-core/axe.min.js"), "utf8");

const WEB = "http://localhost:3000";
const API = "http://localhost:4000";
const ADMIN = { email: "admin@codeforge.local", password: "admin1234!" };

async function apiJson(p, opts = {}) {
  const res = await fetch(API + p, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

async function scan(page, label) {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => {
    // @ts-ignore
    return await axe.run(document, {
      // best-practice rules add noise for a first pass; stick to WCAG A/AA
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
  });
  const v = results.violations;
  console.log(`\n=== ${label}: ${v.length} violation type(s) ===`);
  for (const item of v) {
    console.log(`  [${item.impact}] ${item.id}: ${item.help} (${item.nodes.length} node(s))`);
    for (const n of item.nodes.slice(0, 3)) console.log(`      ${n.target.join(" ")}`);
  }
  return v;
}

const login = await apiJson("/api/auth/login", { method: "POST", body: ADMIN });
const token = login.accessToken;
async function apiAuth(p, opts = {}) {
  const res = await fetch(API + p, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}
const tests = await apiAuth("/api/tests");
const showcase = tests.tests.find((t) => t.title.startsWith("App Dev Skills"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let all = [];

await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
all.push(...(await scan(page, "login")));

await page.fill('input[type="email"]', ADMIN.email);
await page.fill('input[type="password"]', ADMIN.password);
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/, { timeout: 10000 });
await page.waitForTimeout(1500);
all.push(...(await scan(page, "dashboard")));

await page.goto(`${WEB}/questions`, { waitUntil: "networkidle" });
all.push(...(await scan(page, "question-bank")));

await page.goto(`${WEB}/questions/new`, { waitUntil: "networkidle" });
all.push(...(await scan(page, "question-new")));

await page.goto(`${WEB}/tests/${showcase.id}`, { waitUntil: "networkidle" });
all.push(...(await scan(page, "test-overview")));

await page.click('button:has-text("Results")');
await page.waitForTimeout(500);
all.push(...(await scan(page, "test-results")));

await page.goto(`${WEB}/settings`, { waitUntil: "networkidle" });
all.push(...(await scan(page, "settings")));

// ---- Candidate side
const email = `a11y+${Date.now()}@test.local`;
const inv = await apiAuth(`/api/tests/${showcase.id}/invitations`, {
  method: "POST",
  body: { candidates: [{ name: "A11y Candidate", email }] },
});
const ctoken = inv.created[0].link.split("/t/")[1];
const cpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await cpage.goto(`${WEB}/t/${ctoken}`, { waitUntil: "networkidle" });
all.push(...(await scan(cpage, "candidate-landing")));

await cpage.fill('input[type="text"]', "A11y Candidate").catch(() => undefined);
await cpage.fill('input[type="email"]', email);
await cpage.click('button[type="submit"]');
await cpage.waitForTimeout(800);
all.push(...(await scan(cpage, "candidate-after-identity")));

const startBtn = cpage.locator('button:has-text("Start test")');
if (await startBtn.count()) {
  await startBtn.click();
  await cpage.waitForTimeout(1500);
  all.push(...(await scan(cpage, "candidate-test-workspace")));
}

console.log(`\n\nTOTAL violation instances across all pages: ${all.length}`);
await browser.close();
process.exit(all.length === 0 ? 0 : 1);
