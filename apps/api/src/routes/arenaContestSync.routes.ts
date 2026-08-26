import { Router, type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { asyncHandler, notFound, unauthorized } from "../lib/errors";
import { validateBody, validateQuery } from "../middleware/validate";
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
  maxStrikes: z.number().int().default(5),
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
      editorial: z.string().nullish(),
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
// FEAT-7: participant management — the full roster (not just flagged/
// struck rows like review-data below), so HQ can search/filter every
// registrant and manually disqualify or reinstate someone outside of the
// AI-review flow (e.g. an off-platform report, or undoing a bad strike).
// ---------------------------------------------------------------------------

const participantsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(["registered", "active", "submitted", "warned", "disqualified"]).optional(),
});

arenaContestSyncRouter.get(
  "/contests/:contestId/participants",
  serviceLimiter,
  requireArenaSyncSecret,
  validateQuery(participantsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { search, status } = req.query as z.infer<typeof participantsQuerySchema>;
    const participations = await prisma.arenaParticipation.findMany({
      where: {
        contestId: req.params.contestId,
        status,
        user: search
          ? { OR: [{ handle: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] }
          : undefined,
      },
      include: { user: { select: { handle: true, name: true, rating: true } } },
      orderBy: { registeredAt: "asc" },
      take: 500,
    });
    res.json({
      participants: participations.map((p) => ({
        userId: p.userId,
        handle: p.user.handle,
        name: p.user.name,
        rating: p.user.rating,
        status: p.status,
        score: p.score,
        rank: p.rank,
        chosenProctoringLevel: p.chosenProctoringLevel,
        strikeCount: p.strikeCount,
        registeredAt: p.registeredAt,
      })),
    });
  })
);

const participantStatusBodySchema = z.object({ action: z.enum(["disqualify", "reinstate"]) });

/** Manual override, independent of the AI-review flow's cheating_confirmed
 *  path (which zeroes score/rating) — this only ever touches `status`, e.g.
 *  disqualifying someone for an off-platform report, or reinstating a strike
 *  that turned out to be a false positive. Reinstating always returns to
 *  "active" (never "submitted" — that's exclusively the terminal state set
 *  by arenaRating.ts once a contest finishes grading) and zeroes the strike
 *  count, so the proctoring sweep doesn't immediately re-flag them. */
arenaContestSyncRouter.post(
  "/contests/:contestId/participants/:userId/status",
  serviceLimiter,
  requireArenaSyncSecret,
  validateBody(participantStatusBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { contestId, userId } = req.params;
    const participation = await prisma.arenaParticipation.findUnique({
      where: { userId_contestId: { userId, contestId } },
    });
    if (!participation) throw notFound("Participation not found");
    const { action } = req.body as z.infer<typeof participantStatusBodySchema>;

    if (action === "disqualify") {
      const updated = await prisma.arenaParticipation.update({
        where: { id: participation.id },
        data: { status: "disqualified" },
      });
      res.json({ status: updated.status });
      return;
    }

    const updated = await prisma.arenaParticipation.update({
      where: { id: participation.id },
      data: { status: "active", strikeCount: 0 },
    });
    res.json({ status: updated.status });
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
    // Anyone with an AI flag OR a proctoring strike belongs on the review
    // page — a strike-only case (e.g. repeated tab-switching) is just as
    // reviewable as a webcam-flagged one, even with zero AI flags.
    const participations = await prisma.arenaParticipation.findMany({
      where: {
        contestId: req.params.contestId,
        OR: [{ NOT: { aiFlags: { equals: [] } } }, { strikeCount: { gt: 0 } }],
      },
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
          strikeCount: p.strikeCount,
          participationStatus: p.status,
          proctoringEvents: p.proctoringEvents as unknown as { type: string; at: number }[],
        };
      })
    );
    res.json({ participants: rows });
  })
);

interface AnalyticsContestPayload {
  questions: { contestQuestionId: string; seq: number; title: string }[];
}

/** Aggregate stats for HQ's contest analytics dashboard (FEAT-15) — proxied
 *  through hq-api/routes/contest.routes.ts's GET /:id/analytics, same
 *  shared-secret pattern as review-data above. */
arenaContestSyncRouter.get(
  "/contests/:contestId/analytics",
  serviceLimiter,
  requireArenaSyncSecret,
  asyncHandler(async (req: Request, res: Response) => {
    const { contestId } = req.params;
    const cache = await prisma.arenaContestCache.findUnique({ where: { contestId } });
    if (!cache) throw notFound("Contest not found");
    const payload = cache.payload as unknown as AnalyticsContestPayload;

    const [participations, submissions] = await Promise.all([
      prisma.arenaParticipation.findMany({
        where: { contestId },
        select: { score: true, chosenProctoringLevel: true, aiFlags: true },
      }),
      prisma.arenaSubmission.findMany({
        where: { contestId, contestQuestionId: { not: null } },
        select: { contestQuestionId: true, status: true, userId: true },
      }),
    ]);

    const registeredCount = participations.length;
    const averageScore =
      registeredCount > 0 ? participations.reduce((sum, p) => sum + p.score, 0) / registeredCount : 0;

    const proctoringDistribution = { none: 0, webcam: 0, lockdown: 0 } as Record<string, number>;
    for (const p of participations) {
      proctoringDistribution[p.chosenProctoringLevel] = (proctoringDistribution[p.chosenProctoringLevel] ?? 0) + 1;
    }

    const aiFlagCount = participations.filter((p) => Array.isArray(p.aiFlags) && p.aiFlags.length > 0).length;

    const perQuestion = payload.questions
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((q) => {
        const qSubs = submissions.filter((s) => s.contestQuestionId === q.contestQuestionId);
        const attemptedUsers = new Set(qSubs.map((s) => s.userId));
        const acceptedUsers = new Set(qSubs.filter((s) => s.status === "accepted").map((s) => s.userId));
        return {
          contestQuestionId: q.contestQuestionId,
          seq: q.seq,
          title: q.title,
          totalSubmissions: qSubs.length,
          attemptedCount: attemptedUsers.size,
          acceptedCount: acceptedUsers.size,
          acceptanceRatePct: attemptedUsers.size > 0 ? Math.round((acceptedUsers.size / attemptedUsers.size) * 100) : 0,
        };
      });

    res.json({
      registeredCount,
      averageScore: Math.round(averageScore * 100) / 100,
      proctoringDistribution,
      aiFlagCount,
      questions: perQuestion,
    });
  })
);

const broadcastBodySchema = z.object({ message: z.string().min(1).max(2000) });

/** Staff announcement, proxied from hq-api's POST /:id/broadcast (BUG-7).
 *  Read side is the public GET .../broadcasts route below, which the
 *  compete page polls. */
arenaContestSyncRouter.post(
  "/contests/:contestId/broadcast",
  serviceLimiter,
  requireArenaSyncSecret,
  validateBody(broadcastBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { message } = req.body as z.infer<typeof broadcastBodySchema>;
    const broadcast = await prisma.arenaBroadcast.create({
      data: { contestId: req.params.contestId, message },
    });
    res.status(201).json({ broadcast });
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
