import { Router, type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { asyncHandler, notFound, unauthorized } from "../lib/errors";
import { validateBody } from "../middleware/validate";
import { serviceLimiter } from "../middleware/rateLimit";
import { presignGet } from "../lib/s3";

export const arenaContestSyncRouter = Router();

/** Shared-secret auth for HQ pushing contest data into this deployment.
 *  Mirrors routes/support.routes.ts's requireHqSupportSecret exactly, just
 *  keyed on the Arena-specific secret. */
function requireArenaSyncSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = req.headers["x-arena-sync-secret"];
  const expected = config.arenaSyncSecret;
  const ok =
    Boolean(expected) &&
    typeof secret === "string" &&
    secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!ok) return next(unauthorized("Invalid arena sync secret"));
  next();
}

const syncBodySchema = z.object({
  contestId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  status: z.enum(["draft", "scheduled", "live", "grading", "completed", "cancelled"]),
  scoringMode: z.enum(["points", "icpc_penalty"]),
  proctoringLevel: z.enum(["none", "basic", "strict", "lockdown"]),
  webcamRequired: z.boolean(),
  fullscreenRequired: z.boolean(),
  webcamBonusPct: z.number().default(15),
  lockdownBonusPct: z.number().default(35),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  questions: z.array(
    z.object({
      contestQuestionId: z.string().min(1),
      seq: z.number().int(),
      type: z.enum(["coding", "mcq"]).default("coding"),
      title: z.string().min(1),
      bodyMd: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]),
      points: z.number(),
      typeConfig: z.record(z.unknown()),
    })
  ),
});

arenaContestSyncRouter.post(
  "/contests/sync",
  serviceLimiter,
  requireArenaSyncSecret,
  validateBody(syncBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body as z.infer<typeof syncBodySchema>;
    await prisma.arenaContestCache.upsert({
      where: { contestId: payload.contestId },
      create: {
        contestId: payload.contestId,
        payload: payload as unknown as object,
        status: payload.status,
        slug: payload.slug,
        startAt: new Date(payload.startAt),
        endAt: new Date(payload.endAt),
      },
      update: {
        payload: payload as unknown as object,
        status: payload.status,
        slug: payload.slug,
        startAt: new Date(payload.startAt),
        endAt: new Date(payload.endAt),
        syncedAt: new Date(),
      },
    });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// AI proctoring review — HQ's review UI reads flagged snapshots through
// this service-to-service leg (same x-arena-sync-secret pattern; hq-api
// proxies these for the browser so it never needs apps/api credentials of
// its own) and writes staff decisions back through the action route below.
// ---------------------------------------------------------------------------

interface AiFlag {
  severity: number;
  reason: string;
  confidence: number;
  snapshotKey: string;
  createdAt: string;
}

arenaContestSyncRouter.get(
  "/contests/:contestId/review-data",
  serviceLimiter,
  requireArenaSyncSecret,
  asyncHandler(async (req: Request, res: Response) => {
    const participations = await prisma.arenaParticipation.findMany({
      where: { contestId: req.params.contestId, NOT: { aiFlags: { equals: [] } } },
      include: { user: { select: { handle: true, name: true } } },
    });
    const rows = await Promise.all(
      participations.map(async (p) => {
        const flags = p.aiFlags as unknown as AiFlag[];
        const withUrls = await Promise.all(
          flags.map(async (f) => ({ ...f, presignedUrl: await presignGet(f.snapshotKey).catch(() => null) }))
        );
        return {
          userId: p.userId,
          handle: p.user.handle,
          name: p.user.name,
          reviewStatus: p.reviewStatus,
          chosenProctoringLevel: p.chosenProctoringLevel,
          flags: withUrls,
        };
      })
    );
    res.json({ participants: rows });
  })
);

const reviewBodySchema = z.object({ decision: z.enum(["clean", "cheating_confirmed"]) });

arenaContestSyncRouter.post(
  "/contests/:contestId/participants/:userId/review",
  serviceLimiter,
  requireArenaSyncSecret,
  validateBody(reviewBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { contestId, userId } = req.params;
    const participation = await prisma.arenaParticipation.findUnique({
      where: { userId_contestId: { userId, contestId } },
    });
    if (!participation) throw notFound("Participation not found");

    const { decision } = req.body as z.infer<typeof reviewBodySchema>;
    if (decision === "clean") {
      await prisma.arenaParticipation.update({ where: { id: participation.id }, data: { reviewStatus: "clean" } });
      res.json({ reviewStatus: "clean" });
      return;
    }

    // cheating_confirmed: revert this participant's own rating and zero
    // their score/rank. Other participants' already-applied deltas are NOT
    // retroactively recalculated (see plan's documented scope cut) — a
    // full-contest recompute cascade is out of scope for this pass.
    await prisma.$transaction([
      prisma.arenaParticipation.update({
        where: { id: participation.id },
        data: { reviewStatus: "cheating_confirmed", score: 0, rank: null },
      }),
      ...(participation.ratingBefore != null
        ? [
            prisma.arenaUser.update({
              where: { id: userId },
              data: { rating: participation.ratingBefore },
            }),
          ]
        : []),
      prisma.arenaUserBadge.deleteMany({
        where: { userId, contextLabel: { contains: contestId } },
      }),
    ]);
    res.json({ reviewStatus: "cheating_confirmed" });
  })
);
