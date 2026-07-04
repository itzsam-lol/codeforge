/**
 * Repo-submission pipeline (spec 5.3): shallow clone -> install -> build ->
 * test inside a container, plus git-history metadata for reviewers (commit
 * count, message quality heuristic, timing spread) and optional Playwright
 * screenshots of the running app.
 *
 * Dev note: the clone/install container needs network egress (git + npm).
 * Production should pin this pool to a registry allowlist (SECURITY.md).
 */
import { REPO_URL_PATTERN, round2, type RepoConfig } from "@codeforge/shared";
import { execDocker, randomName, removeContainer, tail } from "../../lib/dockerUtil";
import { putObject } from "../../lib/s3";
import { logger } from "../../lib/logger";

const IMAGE = "node:20-bookworm"; // full image: includes git

const GENERIC_MSG = /^(update|updates|fix|fixes|final|wip|changes?|commit|stuff|asdf|test)\.?$/i;

interface StepResult {
  step: string;
  ran: boolean;
  passed: boolean;
  output: string;
}

export interface GitMeta {
  commitCount: number;
  messages: string[];
  genericMessageCount: number;
  firstCommitAt?: string;
  lastCommitAt?: string;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function validateRepoUrl(url: string): boolean {
  return REPO_URL_PATTERN.test(url.trim());
}

/** Dry-run used by the candidate "Validate" button (spec 3.4.4). */
export async function validateRepo(url: string): Promise<{
  ok: boolean;
  detail: string;
  hasPackageJson: boolean;
  commitCount: number;
}> {
  if (!validateRepoUrl(url)) {
    return { ok: false, detail: "URL must be a public GitHub/GitLab/Bitbucket https repo", hasPackageJson: false, commitCount: 0 };
  }
  const script = [
    `git clone --quiet --depth 50 ${shellQuote(url.trim())} /tmp/repo || { echo ::CLONE_FAIL::; exit 1; }`,
    `cd /tmp/repo`,
    `echo ::COMMITS::$(git rev-list --count HEAD)`,
    `[ -f package.json ] && echo ::PKG::yes || echo ::PKG::no`,
  ].join(" && ");
  const run = await execDocker(
    ["run", "--rm", "--memory", "512m", "--cpus", "1", "--pids-limit", "256", IMAGE, "sh", "-c", script],
    { timeoutMs: 120_000 }
  );
  if (run.timedOut) return { ok: false, detail: "Clone timed out (2 min)", hasPackageJson: false, commitCount: 0 };
  if (run.stdout.includes("::CLONE_FAIL::") || run.code !== 0) {
    return { ok: false, detail: `Could not clone: ${tail(run.stderr, 300)}`, hasPackageJson: false, commitCount: 0 };
  }
  const commits = Number(/::COMMITS::(\d+)/.exec(run.stdout)?.[1] ?? 0);
  const hasPkg = run.stdout.includes("::PKG::yes");
  return { ok: true, detail: `Cloned successfully (${commits} commits)`, hasPackageJson: hasPkg, commitCount: commits };
}

export async function gradeRepoProject(
  submission: { id: string; content: string; maxPoints: number },
  cfg: RepoConfig
): Promise<{ autoScore: number | null; rows: object[] }> {
  const url = submission.content.trim();
  const rows: object[] = [];
  if (!validateRepoUrl(url)) {
    return {
      autoScore: 0,
      rows: [{ verdict: "wrong_answer", passed: false, metadata: { kind: "step", step: "clone", detail: "invalid repository URL" } }],
    };
  }

  const D = "::CFSTEP::";
  const parts = [
    `git clone --quiet --depth 50 ${shellQuote(url)} /repo && echo "${D}clone:0" || { echo "${D}clone:1"; exit 0; }`,
    `cd /repo`,
    `echo "${D}gitmeta_begin"`,
    `git log --pretty=format:'%ad|%s' --date=iso | head -100`,
    `echo`, `echo "${D}gitmeta_end:$(git rev-list --count HEAD)"`,
    `if [ -f package.json ]; then (${cfg.setupCommand}) >/tmp/setup.log 2>&1 && echo "${D}setup:0" || echo "${D}setup:1"; tail -c 4000 /tmp/setup.log; else echo "${D}setup:skip"; fi`,
    cfg.buildCommand
      ? `(${cfg.buildCommand}) >/tmp/build.log 2>&1 && echo "${D}build:0" || echo "${D}build:1"; tail -c 6000 /tmp/build.log`
      : `echo "${D}build:skip"`,
    cfg.testCommand
      ? `(${cfg.testCommand}) >/tmp/test.log 2>&1 && echo "${D}test:0" || echo "${D}test:1"; tail -c 6000 /tmp/test.log`
      : `echo "${D}test:skip"`,
  ];
  const run = await execDocker(
    ["run", "--rm", "--memory", "2g", "--cpus", "2", "--pids-limit", "512", IMAGE, "sh", "-c", parts.join("\n")],
    { timeoutMs: 480_000 }
  );
  const out = run.stdout;

  const stepState = (name: string): "0" | "1" | "skip" | null =>
    (new RegExp(`${D}${name}:(0|1|skip)`).exec(out)?.[1] as "0" | "1" | "skip") ?? null;

  const cloneOk = stepState("clone") === "0";
  const steps: StepResult[] = [
    { step: "clone", ran: true, passed: cloneOk, output: cloneOk ? url : tail(run.stderr, 2000) },
  ];
  if (cloneOk) {
    for (const name of ["setup", "build", "test"] as const) {
      const st = stepState(name);
      const section = out.split(`${D}${name}:`)[1]?.split(D)[0] ?? "";
      steps.push({
        step: name,
        ran: st === "0" || st === "1",
        passed: st === "0",
        output: tail(section.replace(/^(0|1|skip)/, "").trim(), 6000),
      });
    }
  }
  if (run.timedOut) {
    steps.push({ step: "timeout", ran: true, passed: false, output: "Pipeline exceeded the 8-minute budget" });
  }

  // ---- Git metadata for the reviewer (a mild signal, surfaced not hidden)
  let gitMeta: GitMeta | null = null;
  const metaBlock = out.split(`${D}gitmeta_begin`)[1]?.split(`${D}gitmeta_end`)[0];
  const commitCount = Number(new RegExp(`${D}gitmeta_end:(\\d+)`).exec(out)?.[1] ?? 0);
  if (metaBlock) {
    const lines = metaBlock.trim().split("\n").filter(Boolean);
    const messages = lines.map((l) => l.split("|").slice(1).join("|").trim()).filter(Boolean);
    const dates = lines.map((l) => l.split("|")[0]?.trim()).filter(Boolean);
    gitMeta = {
      commitCount,
      messages: messages.slice(0, 30),
      genericMessageCount: messages.filter((m) => GENERIC_MSG.test(m)).length,
      firstCommitAt: dates[dates.length - 1],
      lastCommitAt: dates[0],
    };
  }

  for (const s of steps) {
    rows.push({
      verdict: s.passed ? "accepted" : "wrong_answer",
      passed: s.passed,
      stdout: s.output,
      metadata: { kind: "step", step: s.step, ran: s.ran },
    });
  }
  if (gitMeta) {
    rows.push({ verdict: "accepted", passed: true, metadata: { kind: "git", ...gitMeta } });
  }

  // ---- Optional preview screenshots
  if (cloneOk && cfg.previewCommand && cfg.previewPort) {
    try {
      const shots = await captureRepoScreenshots(submission.id, url, cfg);
      for (const s of shots) {
        rows.push({ verdict: "accepted", passed: true, metadata: { kind: "screenshot", route: s.route, key: s.key } });
      }
    } catch (err) {
      logger.warn({ err, submissionId: submission.id }, "repo preview screenshots failed");
    }
  }

  // ---- Score: configured build/test steps only; nothing configured => manual review
  const scored: { passed: boolean; weight: number }[] = [];
  if (cfg.buildCommand) scored.push({ passed: stepState("build") === "0", weight: cfg.buildWeightPct });
  if (cfg.testCommand) scored.push({ passed: stepState("test") === "0", weight: cfg.testWeightPct });
  if (!cloneOk) return { autoScore: 0, rows };
  if (scored.length === 0) return { autoScore: null, rows }; // reviewer scores manually
  const totalW = scored.reduce((s, x) => s + x.weight, 0);
  const gotW = scored.filter((x) => x.passed).reduce((s, x) => s + x.weight, 0);
  return { autoScore: round2((submission.maxPoints * gotW) / totalW), rows };
}

async function captureRepoScreenshots(
  submissionId: string,
  url: string,
  cfg: RepoConfig
): Promise<{ route: string; key: string }[]> {
  const name = randomName("cf-repo-prev");
  const script = [
    `git clone --quiet --depth 1 ${shellQuote(url)} /repo`,
    `cd /repo`,
    `[ -f package.json ] && (${cfg.setupCommand}) >/dev/null 2>&1 || true`,
    cfg.buildCommand ? `(${cfg.buildCommand}) >/dev/null 2>&1 || true` : "true",
    `${cfg.previewCommand}`,
  ].join(" && ");
  const start = await execDocker(
    ["run", "-d", "--name", name, "--memory", "1g", "--cpus", "1",
     "-p", `127.0.0.1:0:${cfg.previewPort}`, IMAGE, "sh", "-c", script],
    { timeoutMs: 60_000 }
  );
  if (start.code !== 0) throw new Error(`preview container failed: ${start.stderr}`);
  try {
    const portRes = await execDocker(["port", name, String(cfg.previewPort)], { timeoutMs: 10_000 });
    const hostPort = /:(\d+)\s*$/m.exec(portRes.stdout)?.[1];
    if (!hostPort) throw new Error("no mapped port");
    const base = `http://127.0.0.1:${hostPort}`;
    // Wait for the app to come up (build + boot can take a while).
    const deadline = Date.now() + 180_000;
    let up = false;
    while (Date.now() < deadline) {
      try {
        await fetch(base, { signal: AbortSignal.timeout(2_000) });
        up = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    if (!up) throw new Error("preview never became reachable");

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const shots: { route: string; key: string }[] = [];
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      for (const route of cfg.previewRoutes) {
        await page.goto(base + route, { waitUntil: "networkidle", timeout: 20_000 }).catch(() => undefined);
        const png = await page.screenshot({ type: "png" });
        const key = `submissions/${submissionId}/route-${route.replace(/\W+/g, "_")}.png`;
        await putObject(key, png, "image/png");
        shots.push({ route, key });
      }
    } finally {
      await browser.close();
    }
    return shots;
  } finally {
    await removeContainer(name);
  }
}
