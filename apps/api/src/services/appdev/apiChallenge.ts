/**
 * API/backend challenge execution (spec 5.2). The candidate's Node server runs
 * inside a container attached to a per-run `--internal` Docker network: no
 * egress, no published ports, unreachable from anywhere except the harness
 * container on the same network. The harness sends the scripted HTTP sequence
 * and reports per-assertion results as JSON on stdout.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { round2, type ApiChallengeConfig, type HttpTest } from "@codeforge/shared";
import {
  execDocker,
  randomName,
  removeContainer,
  removeNetwork,
  tail,
  withTempDir,
  writeFiles,
} from "../../lib/dockerUtil";
import { logger } from "../../lib/logger";

export interface HttpTestResult {
  name: string;
  passed: boolean;
  detail: string;
  status?: number;
  isHidden: boolean;
  weight: number;
}

/** Dependency-free harness executed inside the grading network. */
const HARNESS_SOURCE = `
const fs = require("fs");
const target = process.env.TARGET;
const spec = JSON.parse(fs.readFileSync("/sandbox/tests.json", "utf8"));
(async () => {
  let up = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await fetch(target + "/", { method: "GET" }); up = true; break; }
    catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  const results = [];
  if (!up) { console.log(JSON.stringify({ ready: false, results })); return; }
  for (const t of spec.tests) {
    const r = { name: t.name, passed: false, detail: "" };
    try {
      const res = await fetch(target + t.path, {
        method: t.method,
        headers: { ...(t.body ? { "content-type": "application/json" } : {}), ...(t.headers || {}) },
        body: t.body || undefined,
      });
      const text = await res.text();
      const failed = [];
      if (t.expectStatus != null && res.status !== t.expectStatus)
        failed.push("status " + res.status + " (expected " + t.expectStatus + ")");
      if (t.expectBodyContains && !text.includes(t.expectBodyContains))
        failed.push('body missing "' + t.expectBodyContains + '"');
      if (t.expectJsonPath) {
        try {
          let v = JSON.parse(text);
          for (const k of t.expectJsonPath.split(".")) v = v == null ? v : v[k];
          if (String(v) !== String(t.expectJsonValue))
            failed.push("$." + t.expectJsonPath + " = " + JSON.stringify(v) + " (expected " + t.expectJsonValue + ")");
        } catch { failed.push("response is not valid JSON"); }
      }
      r.passed = failed.length === 0;
      r.status = res.status;
      r.detail = failed.join("; ") || ("status " + res.status);
    } catch (e) { r.detail = "request failed: " + e.message; }
    results.push(r);
  }
  console.log(JSON.stringify({ ready: true, results }));
})();
`;

export async function runHttpTests(
  serverCode: string,
  cfg: ApiChallengeConfig,
  tests: HttpTest[]
): Promise<{ ready: boolean; results: HttpTestResult[]; serverLogs: string }> {
  const net = randomName("cf-api-net");
  const container = randomName("cf-api-srv");

  return withTempDir(async (dir) => {
    await writeFiles(dir, {
      "server.js": serverCode,
      "harness.js": HARNESS_SOURCE,
      "tests.json": JSON.stringify({ tests }),
    });
    // The port the candidate must listen on is provided via env.
    try {
      const netRes = await execDocker(["network", "create", "--internal", net], { timeoutMs: 30_000 });
      if (netRes.code !== 0) throw new Error(`network create failed: ${netRes.stderr}`);

      const srv = await execDocker(
        [
          "run", "-d", "--name", container,
          "--network", net, "--network-alias", "target",
          "--memory", "256m", "--cpus", "1", "--pids-limit", "128",
          "--read-only", "--user", "65534:65534",
          "-e", `PORT=${cfg.port}`,
          "-v", `${dir}:/sandbox:ro`,
          "node:20-alpine", "node", "/sandbox/server.js",
        ],
        { timeoutMs: 60_000 }
      );
      if (srv.code !== 0) throw new Error(`candidate container failed to start: ${srv.stderr}`);

      const harness = await execDocker(
        [
          "run", "--rm",
          "--network", net,
          "--memory", "128m", "--cpus", "0.5", "--pids-limit", "64",
          "--read-only", "--user", "65534:65534",
          "-e", `TARGET=http://target:${cfg.port}`,
          "-v", `${dir}:/sandbox:ro`,
          "node:20-alpine", "node", "/sandbox/harness.js",
        ],
        { timeoutMs: 90_000 }
      );

      const logs = await execDocker(["logs", container], { timeoutMs: 15_000 });
      const serverLogs = tail(`${logs.stdout}\n${logs.stderr}`.trim(), 6_000);

      let parsed: { ready: boolean; results: { name: string; passed: boolean; detail: string; status?: number }[] };
      try {
        parsed = JSON.parse(harness.stdout.trim().split("\n").pop() ?? "{}");
      } catch {
        throw new Error(`harness produced no result (${tail(harness.stderr, 500)})`);
      }
      const byName = new Map(tests.map((t) => [t.name, t]));
      return {
        ready: parsed.ready,
        serverLogs,
        results: (parsed.results ?? []).map((r) => ({
          ...r,
          isHidden: byName.get(r.name)?.isHidden ?? true,
          weight: byName.get(r.name)?.weight ?? 1,
        })),
      };
    } finally {
      await removeContainer(container);
      await removeNetwork(net);
      // best-effort: some Windows daemons hold the mount briefly
      await fs.rm(path.join(dir, "tests.json")).catch(() => undefined);
    }
  });
}

export async function gradeApiChallenge(
  submission: { id: string; content: string; maxPoints: number },
  question: { typeConfig: unknown },
  cfg: ApiChallengeConfig
): Promise<{ autoScore: number; rows: object[] }> {
  const { ready, results, serverLogs } = await runHttpTests(submission.content, cfg, cfg.httpTests);
  if (!ready) {
    logger.warn({ submissionId: submission.id }, "api challenge: server never became ready");
    return {
      autoScore: 0,
      rows: [
        {
          verdict: "runtime_error",
          passed: false,
          stderr: serverLogs || "The server never started listening on the expected port.",
          metadata: { kind: "http", name: "Server readiness", detail: "no response within 20s" },
        },
      ],
    };
  }
  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  const passedWeight = results.filter((r) => r.passed).reduce((s, r) => s + r.weight, 0);
  const rows = results.map((r) => ({
    verdict: r.passed ? "accepted" : "wrong_answer",
    passed: r.passed,
    metadata: { kind: "http", name: r.name, detail: r.detail, status: r.status, isHidden: r.isHidden },
  }));
  rows.push({
    verdict: "accepted",
    passed: true,
    // Server logs help reviewers debug "no output vs crashed" (spec Section 10)
    metadata: { kind: "server_logs", name: "Server logs", detail: serverLogs.slice(0, 4000) },
  } as never);
  return {
    autoScore: totalWeight > 0 ? round2((submission.maxPoints * passedWeight) / totalWeight) : 0,
    rows,
  };
}
