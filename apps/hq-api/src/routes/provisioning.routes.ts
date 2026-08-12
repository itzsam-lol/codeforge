import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateBody, singleLine } from "../middleware/validate";
import { encryptSecret, fingerprintSecret } from "../lib/crypto";
import { startRun, runDiagnostic, DIAGNOSTIC_COMMANDS, type DiagnosticKey } from "../services/provisioning";

// No router-wide requireAuth/requirePermission(): this router now shares
// the bare "/api" mount prefix with invoiceRouter (see app.ts). A path-less
// .use() would match every request forwarded to this router regardless of
// whether one of ITS OWN routes ends up matching, wrongly gating
// invoiceRouter's routes behind "provisioning" (the same Express gotcha
// already fixed once in apps/api/src/routes/integrity.routes.ts). Each
// route below carries its own requireAuth + requirePermission instead.
export const provisioningRouter = Router();

const TARGET_SELECT = {
  id: true,
  host: true,
  sshPort: true,
  sshUsername: true,
  sshKeyFingerprint: true,
  repoUrl: true,
  appDomain: true,
  mediaDomain: true,
  updatedAt: true,
} as const;

provisioningRouter.put(
  "/clients/:clientId/provisioning/target",
  requireAuth,
  requirePermission("provisioning"),
  validateBody(
    z.object({
      // Hostname/IPv4/IPv6 charset only: never reaches a shell string
      // directly (only ssh2's connect()), but constrained anyway since
      // it's persisted and reused across every future run.
      host: z.string().min(1).max(255).regex(/^[a-zA-Z0-9.:_-]+$/, "must be a plain hostname or IP address"),
      sshPort: z.coerce.number().int().min(1).max(65535).default(22),
      // sshUsername and repoUrl ARE interpolated into shell command strings
      // in provisioning.ts (chown, git clone) — a permissive charset here
      // is a command-injection vector for whoever can set a target (an
      // HQ staff account with "provisioning" access, or a compromised one).
      // Restricting to the standard POSIX username charset and a plain
      // https URL closes it without needing to rewrite exec() to pass
      // argv out of band.
      sshUsername: z.string().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/, "must be a plain username (letters, digits, - or _)"),
      sshPrivateKey: z.string().min(20),
      repoUrl: z
        .string()
        .url()
        .max(500)
        .regex(/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?\/[a-zA-Z0-9._\-/]+$/, "must be a plain https:// repository URL")
        .default("https://github.com/itzsam-lol/codeforge.git"),
      appDomain: singleLine(255).min(1),
      mediaDomain: singleLine(255).min(1),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const client = await prisma.client.findUnique({ where: { id: req.params.clientId } });
    if (!client) throw notFound("Client not found");
    const body = req.body as {
      host: string;
      sshPort: number;
      sshUsername: string;
      sshPrivateKey: string;
      repoUrl: string;
      appDomain: string;
      mediaDomain: string;
    };

    const target = await prisma.provisioningTarget.upsert({
      where: { clientId: client.id },
      create: {
        clientId: client.id,
        host: body.host,
        sshPort: body.sshPort,
        sshUsername: body.sshUsername,
        sshPrivateKeyEnc: encryptSecret(body.sshPrivateKey),
        sshKeyFingerprint: fingerprintSecret(body.sshPrivateKey),
        repoUrl: body.repoUrl,
        appDomain: body.appDomain,
        mediaDomain: body.mediaDomain,
      },
      update: {
        host: body.host,
        sshPort: body.sshPort,
        sshUsername: body.sshUsername,
        sshPrivateKeyEnc: encryptSecret(body.sshPrivateKey),
        sshKeyFingerprint: fingerprintSecret(body.sshPrivateKey),
        repoUrl: body.repoUrl,
        appDomain: body.appDomain,
        mediaDomain: body.mediaDomain,
      },
      select: TARGET_SELECT,
    });
    res.json({ target });
  })
);

provisioningRouter.post(
  "/clients/:clientId/provisioning/runs",
  requireAuth,
  requirePermission("provisioning"),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await prisma.provisioningTarget.findUnique({ where: { clientId: req.params.clientId } });
    if (!target) throw notFound("No provisioning target is configured for this client yet");
    const run = await startRun(target.id);
    res.status(202).json({ run });
  })
);

provisioningRouter.get(
  "/clients/:clientId/provisioning/runs",
  requireAuth,
  requirePermission("provisioning"),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await prisma.provisioningTarget.findUnique({ where: { clientId: req.params.clientId } });
    if (!target) return res.json({ runs: [] });
    const runs = await prisma.provisioningRun.findMany({
      where: { targetId: target.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, startedAt: true, finishedAt: true, errorMessage: true, createdAt: true },
    });
    res.json({ runs });
  })
);

provisioningRouter.get(
  "/provisioning/runs/:runId",
  requireAuth,
  requirePermission("provisioning"),
  asyncHandler(async (req: Request, res: Response) => {
    const run = await prisma.provisioningRun.findUnique({
      where: { id: req.params.runId },
      include: { steps: { orderBy: { seq: "asc" } } },
    });
    if (!run) throw notFound("Run not found");
    res.json({ run });
  })
);

provisioningRouter.get(
  "/clients/:clientId/provisioning/health",
  requireAuth,
  requirePermission("provisioning"),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await prisma.provisioningTarget.findUnique({ where: { clientId: req.params.clientId } });
    if (!target) return res.json({ logs: [] });
    const logs = await prisma.healthCheckLog.findMany({
      where: { targetId: target.id },
      orderBy: { checkedAt: "desc" },
      take: 20,
    });
    res.json({ logs });
  })
);

provisioningRouter.post(
  "/clients/:clientId/provisioning/diagnostics",
  requireAuth,
  requirePermission("provisioning"),
  validateBody(z.object({ command: z.enum(Object.keys(DIAGNOSTIC_COMMANDS) as [DiagnosticKey, ...DiagnosticKey[]]) })),
  asyncHandler(async (req: Request, res: Response) => {
    const target = await prisma.provisioningTarget.findUnique({ where: { clientId: req.params.clientId } });
    if (!target) throw notFound("No provisioning target is configured for this client yet");
    let output: string;
    try {
      output = await runDiagnostic(target.id, (req.body as { command: DiagnosticKey }).command);
    } catch (err) {
      // Surface the real reason (e.g. "Timed out while waiting for
      // handshake") instead of a generic 500 — this is a staff-facing
      // diagnostic tool, the failure itself is the useful information.
      throw badRequest(err instanceof Error ? err.message : "Could not reach the host");
    }
    res.json({ output });
  })
);
