import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { NodeSSH } from "node-ssh";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { decryptSecret } from "../lib/crypto";
import { conflict } from "../lib/errors";

const REPO_DIR = "/opt/codeforge";
const MAX_OUTPUT_CHARS = 20_000;

interface StepDef {
  name: string;
  run: (ssh: NodeSSH, ctx: RunContext, appendOutput: (chunk: string) => void) => Promise<void>;
}

interface RunContext {
  host: string;
  sshUsername: string;
  repoUrl: string;
  appDomain: string;
  mediaDomain: string;
  companyName: string;
  adminEmail: string;
  clientId: string;
  secrets: {
    jwtAccessSecret: string;
    jwtRefreshSecret: string;
    s3SecretKey: string;
    seedAdminPassword: string;
  };
}

function exec(ssh: NodeSSH, command: string, append: (c: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    ssh
      .execCommand(command, {
        cwd: REPO_DIR,
        onStdout: (chunk) => append(chunk.toString("utf8")),
        onStderr: (chunk) => append(chunk.toString("utf8")),
      })
      .then((result) => {
        if (result.code !== 0) {
          reject(new Error(`Command failed (exit ${result.code}): ${command}`));
        } else {
          resolve();
        }
      })
      .catch(reject);
  });
}

/**
 * Strips characters that could break out of a single KEY=value line in the
 * .env this writes remotely. A newline in any interpolated value would
 * otherwise let it inject or override a LATER line — e.g. a company name of
 * "Acme\nJWT_ACCESS_SECRET=<attacker-chosen>" would win over the real
 * JWT_ACCESS_SECRET line above it, since dotenv/Compose resolve duplicate
 * keys last-occurrence-wins. companyName in particular is reachable from
 * the public, unauthenticated marketing contact form (lead -> convert ->
 * provisioning), so this can't rely on the value merely "looking like" a
 * company name by the time it gets here.
 */
function sanitizeEnvValue(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

function envTemplate(ctx: RunContext): string {
  const appDomain = sanitizeEnvValue(ctx.appDomain);
  const mediaDomain = sanitizeEnvValue(ctx.mediaDomain);
  const companyName = sanitizeEnvValue(ctx.companyName);
  const adminEmail = sanitizeEnvValue(ctx.adminEmail);
  return [
    "NODE_ENV=production",
    `WEB_ORIGIN=https://${appDomain}`,
    "API_ORIGIN=http://api:4000",
    "DATABASE_URL=postgresql://codeforge:codeforge@postgres:5432/codeforge",
    "REDIS_URL=redis://redis:6379",
    `JWT_ACCESS_SECRET=${ctx.secrets.jwtAccessSecret}`,
    `JWT_REFRESH_SECRET=${ctx.secrets.jwtRefreshSecret}`,
    "EXECUTOR=judge0",
    "JUDGE0_URL=http://judge0-server:2358",
    `S3_ENDPOINT=https://${mediaDomain}`,
    "S3_ACCESS_KEY=codeforge",
    `S3_SECRET_KEY=${ctx.secrets.s3SecretKey}`,
    "S3_BUCKET=codeforge",
    `SEED_ORG_NAME=${companyName}`,
    `SEED_ADMIN_EMAIL=${adminEmail}`,
    `SEED_ADMIN_PASSWORD=${ctx.secrets.seedAdminPassword}`,
    `APP_DOMAIN=${appDomain}`,
    `MEDIA_DOMAIN=${mediaDomain}`,
    "EMAIL_DRIVER=console",
    // Lets this deployment dual-write codeforge-channel support tickets
    // back to HQ (see apps/api/src/services/support.ts) — identifies which
    // HQ client this single-tenant install belongs to. HQ_SUPPORT_INGEST_SECRET
    // is deliberately left blank here: it's a real secret the operator sets
    // by hand post-deploy (matching HQ_INGEST_SECRET's own convention),
    // never generated/transmitted by this template.
    `HQ_CLIENT_ID=${ctx.clientId}`,
    "HQ_API_URL=",
    "HQ_SUPPORT_INGEST_SECRET=",
    "",
  ].join("\n");
}

const STEPS: StepDef[] = [
  {
    name: "Connect and verify host prerequisites",
    run: async (ssh, _ctx, append) => {
      await exec(ssh, "git --version", append);
      const dockerCheck = await ssh.execCommand("docker compose version", { cwd: "/" });
      if (dockerCheck.code !== 0) {
        throw new Error(
          "Docker (with the compose plugin) was not found on this host. Install it first — " +
            "see DEPLOYMENT.md Part D step 2 — then retry this run."
        );
      }
      append(dockerCheck.stdout);
    },
  },
  {
    name: "Clone or update the repository",
    run: async (ssh, ctx, append) => {
      await exec(
        ssh,
        `sudo mkdir -p ${REPO_DIR} && sudo chown ${ctx.sshUsername}:${ctx.sshUsername} ${REPO_DIR}`,
        append
      );
      const check = await ssh.execCommand(`test -d ${REPO_DIR}/.git`, { cwd: "/" });
      if (check.code === 0) {
        await exec(ssh, `git -C ${REPO_DIR} pull`, append);
      } else {
        await exec(ssh, `git clone ${ctx.repoUrl} ${REPO_DIR}`, append);
      }
    },
  },
  {
    name: "Write .env and align MinIO credentials",
    run: async (ssh, ctx, append) => {
      const localTmp = path.join(os.tmpdir(), `codeforge-hq-env-${crypto.randomUUID()}`);
      await fs.writeFile(localTmp, envTemplate(ctx), "utf8");
      try {
        await ssh.putFile(localTmp, `${REPO_DIR}/.env`);
      } finally {
        await fs.unlink(localTmp).catch(() => undefined);
      }
      append("Wrote .env\n");
      // docker-compose.yml hardcodes MINIO_ROOT_PASSWORD; keep it in sync
      // with the generated S3_SECRET_KEY or MinIO rejects the API's
      // requests (see DEPLOYMENT.md Part E note).
      await exec(
        ssh,
        `sed -i "s/MINIO_ROOT_PASSWORD: codeforge-secret/MINIO_ROOT_PASSWORD: ${ctx.secrets.s3SecretKey}/" ${REPO_DIR}/docker-compose.yml`,
        append
      );
    },
  },
  {
    name: "Build and start the stack",
    run: async (ssh, _ctx, append) => {
      await exec(ssh, "docker compose --profile app --profile prod up -d --build", append);
    },
  },
  {
    name: "Wait for TLS certificates",
    run: async (ssh, ctx, append) => {
      const deadline = Date.now() + 5 * 60 * 1000;
      let ok = false;
      while (Date.now() < deadline) {
        const logs = await ssh.execCommand("docker compose logs caddy --no-color --tail 300", { cwd: REPO_DIR });
        const seenApp = logs.stdout.includes(ctx.appDomain) && logs.stdout.includes("certificate obtained successfully");
        const seenMedia =
          logs.stdout.includes(ctx.mediaDomain) && logs.stdout.includes("certificate obtained successfully");
        if (seenApp && seenMedia) {
          ok = true;
          append("Certificates obtained for both domains\n");
          break;
        }
        await new Promise((r) => setTimeout(r, 10_000));
      }
      if (!ok) {
        throw new Error(
          "Timed out waiting for Caddy to obtain TLS certificates. Check that both domains' DNS " +
            "already resolves to this host, then retry."
        );
      }
    },
  },
  {
    name: "Run database migrations",
    run: async (ssh, _ctx, append) => {
      await exec(ssh, "docker compose --profile app exec -T api npm run db:deploy", append);
    },
  },
  {
    name: "Seed the first admin account",
    run: async (ssh, _ctx, append) => {
      await exec(ssh, "docker compose --profile app exec -T api npm run db:seed", append);
    },
  },
  {
    name: "Confirm the API is healthy",
    run: async (_ssh, ctx, append) => {
      const deadline = Date.now() + 2 * 60 * 1000;
      let ok = false;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`https://${ctx.appDomain}/healthz`);
          if (res.ok) {
            ok = true;
            append(`healthz responded ${res.status}\n`);
            break;
          }
        } catch {
          // not reachable yet; keep polling until the deadline
        }
        await new Promise((r) => setTimeout(r, 5_000));
      }
      if (!ok) throw new Error(`https://${ctx.appDomain}/healthz did not become healthy in time.`);
    },
  },
];

/** Marks any run left "running" at boot (a crash mid-deploy) as failed rather than silently stuck. */
export async function reconcileOrphanedRuns(): Promise<void> {
  const { count } = await prisma.provisioningRun.updateMany({
    where: { status: "running" },
    data: { status: "failed", errorMessage: "Interrupted by an HQ API restart", finishedAt: new Date() },
  });
  if (count > 0) logger.warn({ count }, "reconciled orphaned provisioning runs");
}

export async function startRun(targetId: string): Promise<{ id: string }> {
  const target = await prisma.provisioningTarget.findUnique({
    where: { id: targetId },
    include: { client: true },
  });
  if (!target) throw new Error("Provisioning target not found");

  const existing = await prisma.provisioningRun.findFirst({
    where: { targetId, status: { in: ["queued", "running"] } },
  });
  if (existing) throw conflict("A provisioning run is already in progress for this target");

  const run = await prisma.provisioningRun.create({
    data: {
      targetId,
      status: "queued",
      steps: { create: STEPS.map((s, i) => ({ seq: i, name: s.name, status: "pending" })) },
    },
  });

  void executeRun(run.id, target).catch((err) => logger.error({ err, runId: run.id }, "provisioning run crashed"));

  return { id: run.id };
}

async function executeRun(
  runId: string,
  target: Awaited<ReturnType<typeof prisma.provisioningTarget.findUniqueOrThrow>> & {
    client: { companyName: string; contactEmail: string };
  }
): Promise<void> {
  await prisma.provisioningRun.update({ where: { id: runId }, data: { status: "running", startedAt: new Date() } });

  const ctx: RunContext = {
    host: target.host,
    sshUsername: target.sshUsername,
    repoUrl: target.repoUrl,
    appDomain: target.appDomain,
    mediaDomain: target.mediaDomain,
    companyName: target.client.companyName,
    adminEmail: target.client.contactEmail,
    clientId: target.clientId,
    secrets: {
      jwtAccessSecret: crypto.randomBytes(48).toString("hex"),
      jwtRefreshSecret: crypto.randomBytes(48).toString("hex"),
      s3SecretKey: crypto.randomBytes(24).toString("hex"),
      seedAdminPassword: crypto.randomBytes(9).toString("base64url"),
    },
  };

  const ssh = new NodeSSH();
  const steps = await prisma.provisioningStep.findMany({ where: { runId }, orderBy: { seq: "asc" } });

  try {
    for (let i = 0; i < STEPS.length; i++) {
      const step = steps[i];
      await prisma.provisioningStep.update({
        where: { id: step.id },
        data: { status: "running", startedAt: new Date() },
      });

      let buffer = "";
      let lastFlush = 0;
      const append = (chunk: string) => {
        buffer += chunk;
        if (buffer.length > MAX_OUTPUT_CHARS) buffer = buffer.slice(buffer.length - MAX_OUTPUT_CHARS);
        const now = Date.now();
        if (now - lastFlush > 2000) {
          lastFlush = now;
          void prisma.provisioningStep.update({ where: { id: step.id }, data: { output: buffer } }).catch(() => undefined);
        }
      };

      try {
        // The SSH connection itself is step 0's precondition, not a
        // separate phase — connecting inside this step's try/catch (rather
        // than once before the loop) means a handshake failure is
        // attributed to the step the UI shows as "running," instead of
        // leaving every step "pending" while only the run-level
        // errorMessage explains why.
        if (i === 0) {
          append("Connecting...\n");
          await ssh.connect({
            host: target.host,
            port: target.sshPort,
            username: target.sshUsername,
            privateKey: decryptSecret(target.sshPrivateKeyEnc),
          });
          append("Connected\n");
        }
        await STEPS[i].run(ssh, ctx, append);
        await prisma.provisioningStep.update({
          where: { id: step.id },
          data: { status: "succeeded", finishedAt: new Date(), output: buffer },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.provisioningStep.update({
          where: { id: step.id },
          data: { status: "failed", finishedAt: new Date(), output: `${buffer}\n${message}`.slice(-MAX_OUTPUT_CHARS) },
        });
        throw err;
      }
    }

    await prisma.provisioningRun.update({
      where: { id: runId },
      data: { status: "succeeded", finishedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.provisioningRun.update({
      where: { id: runId },
      data: { status: "failed", errorMessage: message, finishedAt: new Date() },
    });
  } finally {
    ssh.dispose();
  }
}

// ---------------------------------------------------------------------------
// On-demand diagnostics
// ---------------------------------------------------------------------------

/**
 * Fixed, allowlisted commands only — never a client-supplied shell string.
 * A general remote-shell box in the UI would be a real security hole; three
 * canned read-only diagnostics reusing the same SSH connection logic as
 * provisioning covers the "is it actually broken, and why" question staff
 * need without that exposure.
 */
export const DIAGNOSTIC_COMMANDS = {
  disk: "df -h",
  logs: `docker compose logs api --tail 200`,
  status: "docker compose ps",
} as const;
export type DiagnosticKey = keyof typeof DIAGNOSTIC_COMMANDS;

export async function runDiagnostic(targetId: string, key: DiagnosticKey): Promise<string> {
  const target = await prisma.provisioningTarget.findUnique({ where: { id: targetId } });
  if (!target) throw new Error("Provisioning target not found");

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: target.host,
      port: target.sshPort,
      username: target.sshUsername,
      privateKey: decryptSecret(target.sshPrivateKeyEnc),
    });
    const result = await ssh.execCommand(DIAGNOSTIC_COMMANDS[key], { cwd: REPO_DIR });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return output.slice(-MAX_OUTPUT_CHARS) || "(no output)";
  } finally {
    ssh.dispose();
  }
}
