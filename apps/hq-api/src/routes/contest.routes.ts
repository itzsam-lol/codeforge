import { Router, type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, conflict, notFound, unauthorized } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateBody, validateQuery, singleLine } from "../middleware/validate";
import { aiGenerateLimiter, serviceLimiter } from "../middleware/rateLimit";
import { config } from "../config";
import { audit } from "../services/audit";
import { syncContestToArena } from "../services/arenaSync";
import { generateContestQuestion } from "../services/aiQuestion";

export const contestRouter = Router();

const CONTEST_STATUSES = ["draft", "scheduled", "live", "grading", "completed", "cancelled"] as const;

async function generateUniqueSlug(title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "contest";
  let candidate = base;
  let suffix = 0;
  while (await prisma.contest.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

async function loadContestWithQuestions(id: string) {
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: { questions: { orderBy: { seq: "asc" } }, createdByStaff: { select: { name: true } } },
  });
  if (!contest) throw notFound("Contest not found");
  return contest;
}

// ---------------------------------------------------------------------------
// Results receiver — apps/api pushes final standings here once rating
// computation finishes (services/arenaRating.ts). Shared-secret auth, not
// staff auth. Registered BEFORE the router-wide requireAuth/requirePermission
// gate below (not skipped via next("route") from within it — that only skips
// to the next route within a router.route() chain; called from a plain
// .use() middleware, as this router's previous version did, it behaves like
// a no-op next() and the request still falls through into requireAuth,
// 401ing this service-to-service call every time. Confirmed live: the fixed
// version was verified with a direct curl against this exact endpoint).
// ---------------------------------------------------------------------------

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

const resultsSchema = z.object({
  standings: z.array(
    z.object({
      userId: z.string(),
      handle: z.string(),
      name: z.string(),
      score: z.number(),
      penaltyMs: z.string(),
      rank: z.number().nullable(),
      ratingBefore: z.number().nullable(),
      ratingAfter: z.number().nullable(),
      chosenProctoringLevel: z.string().optional(),
      aiFlags: z.array(z.record(z.unknown())).optional(),
      reviewStatus: z.string().optional(),
    })
  ),
});

contestRouter.post(
  "/:id/results",
  serviceLimiter,
  requireArenaSyncSecret,
  validateBody(resultsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const { standings } = req.body as z.infer<typeof resultsSchema>;
    await prisma.contest.update({
      where: { id: contest.id },
      data: { status: "completed", resultsSnapshot: standings as Prisma.InputJsonValue },
    });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Staff-authenticated CRUD
// ---------------------------------------------------------------------------

contestRouter.use(requireAuth, requirePermission("contests"));

contestRouter.get(
  "/",
  validateQuery(z.object({ status: z.enum(CONTEST_STATUSES).optional(), search: z.string().optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, search } = req.query as { status?: string; search?: string };
    const contests = await prisma.contest.findMany({
      where: {
        status: status ? (status as (typeof CONTEST_STATUSES)[number]) : undefined,
        title: search ? { contains: search, mode: "insensitive" } : undefined,
      },
      orderBy: { startAt: "desc" },
      include: { _count: { select: { questions: true } } },
    });
    res.json({ contests });
  })
);

contestRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await loadContestWithQuestions(req.params.id);
    res.json({ contest });
  })
);

const createSchema = z.object({
  title: singleLine(200).min(1),
  description: z.string().max(20_000).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

contestRouter.post(
  "/",
  validateBody(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof createSchema>;
    if (body.endAt <= body.startAt) throw badRequest("End time must be after start time");
    const slug = await generateUniqueSlug(body.title);
    const contest = await prisma.contest.create({
      data: {
        title: body.title,
        description: body.description ?? "",
        slug,
        startAt: body.startAt,
        endAt: body.endAt,
        createdByStaffId: req.staff!.id,
      },
    });
    await audit(req.staff!.id, "contest.create", "contest", contest.id, { title: contest.title });
    res.status(201).json({ contest });
  })
);

const updateSchema = z.object({
  title: singleLine(200).min(1).optional(),
  description: z.string().max(20_000).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  registrationOpensAt: z.coerce.date().nullable().optional(),
  registrationClosesAt: z.coerce.date().nullable().optional(),
  scoringMode: z.enum(["points", "icpc_penalty"]).optional(),
  proctoringLevel: z.enum(["none", "basic", "strict", "lockdown"]).optional(),
  webcamRequired: z.boolean().optional(),
  fullscreenRequired: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  webcamBonusPct: z.number().min(0).max(200).optional(),
  lockdownBonusPct: z.number().min(0).max(200).optional(),
});

contestRouter.patch(
  "/:id",
  validateBody(updateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Contest not found");
    const contest = await prisma.contest.update({ where: { id: req.params.id }, data: req.body });
    await audit(req.staff!.id, "contest.update", "contest", contest.id, req.body as Record<string, unknown>);
    res.json({ contest });
  })
);

// --- Questions sub-CRUD ---

const questionSchema = z.object({
  type: z.enum(["coding", "mcq"]).default("coding"),
  title: z.string().min(1).max(300),
  bodyMd: z.string().min(1).max(50_000),
  difficulty: z.enum(["easy", "medium", "hard"]),
  points: z.number().positive().default(100),
  typeConfig: z.record(z.unknown()),
});

const generateQuestionSchema = z.object({
  type: z.enum(["coding", "mcq"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string().max(200).default(""),
});

/** Returns a draft only — never creates a ContestQuestion row. The staff
 *  member reviews/edits it client-side, then saves it through the normal
 *  POST /:id/questions below like any manually-authored question. */
contestRouter.post(
  "/:id/questions/generate",
  aiGenerateLimiter,
  validateBody(generateQuestionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const body = req.body as z.infer<typeof generateQuestionSchema>;
    const draft = await generateContestQuestion(body);
    if (!draft) {
      throw conflict("AI generation is unavailable right now — try again, or check GCP configuration");
    }
    res.json({ draft });
  })
);

contestRouter.post(
  "/:id/questions",
  validateBody(questionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const maxSeq = await prisma.contestQuestion.aggregate({
      where: { contestId: contest.id },
      _max: { seq: true },
    });
    const body = req.body as z.infer<typeof questionSchema>;
    const question = await prisma.contestQuestion.create({
      data: {
        ...body,
        typeConfig: body.typeConfig as Prisma.InputJsonValue,
        contestId: contest.id,
        seq: (maxSeq._max.seq ?? 0) + 1,
      },
    });
    res.status(201).json({ question });
  })
);

contestRouter.patch(
  "/:id/questions/:qid",
  validateBody(questionSchema.partial().extend({ seq: z.number().int().optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.contestQuestion.findFirst({
      where: { id: req.params.qid, contestId: req.params.id },
    });
    if (!existing) throw notFound("Question not found");
    const body = req.body as Partial<z.infer<typeof questionSchema>> & { seq?: number };
    const question = await prisma.contestQuestion.update({
      where: { id: existing.id },
      data: { ...body, typeConfig: body.typeConfig as Prisma.InputJsonValue | undefined },
    });
    res.json({ question });
  })
);

contestRouter.delete(
  "/:id/questions/:qid",
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.contestQuestion.findFirst({
      where: { id: req.params.qid, contestId: req.params.id },
    });
    if (!existing) throw notFound("Question not found");
    await prisma.contestQuestion.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  })
);

// --- Lifecycle actions ---

contestRouter.post(
  "/:id/publish",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await loadContestWithQuestions(req.params.id);
    if (contest.status !== "draft") throw conflict("Only a draft contest can be published");
    if (contest.questions.length === 0) throw badRequest("Add at least one question before publishing");
    const updated = await prisma.contest.update({
      where: { id: contest.id },
      data: { status: "scheduled", publishedAt: new Date(), syncStatus: "pending" },
    });
    await audit(req.staff!.id, "contest.publish", "contest", contest.id, {});
    void syncContestToArena({ ...updated, questions: contest.questions });
    res.json({ contest: updated });
  })
);

/** Manual early end — the normal scheduled->live->grading transition is
 *  automatic (services/contestLifecycle.ts, at startAt/endAt); this covers
 *  a staff member needing to cut a contest short. */
contestRouter.post(
  "/:id/end",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await loadContestWithQuestions(req.params.id);
    if (!["live", "scheduled"].includes(contest.status)) {
      throw conflict("Only a live or scheduled contest can be ended");
    }
    const updated = await prisma.contest.update({
      where: { id: contest.id },
      data: { status: "grading", syncStatus: "pending" },
    });
    await audit(req.staff!.id, "contest.end", "contest", contest.id, {});
    void syncContestToArena({ ...updated, questions: contest.questions });
    res.json({ contest: updated });
  })
);

contestRouter.post(
  "/:id/cancel",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await loadContestWithQuestions(req.params.id);
    if (["completed", "cancelled"].includes(contest.status)) throw conflict("This contest can't be cancelled");
    const updated = await prisma.contest.update({
      where: { id: contest.id },
      data: { status: "cancelled", syncStatus: "pending" },
    });
    await audit(req.staff!.id, "contest.cancel", "contest", contest.id, {});
    void syncContestToArena({ ...updated, questions: contest.questions });
    res.json({ contest: updated });
  })
);

contestRouter.post(
  "/:id/resync",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await loadContestWithQuestions(req.params.id);
    await prisma.contest.update({ where: { id: contest.id }, data: { syncStatus: "pending" } });
    void syncContestToArena(contest);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// AI proctoring review — proxies apps/api's review-data/review endpoints
// using the shared arena-sync secret, so the browser never needs its own
// credentials for apps/api and staff auth stays entirely within HQ's system.
// ---------------------------------------------------------------------------

contestRouter.get(
  "/:id/review-data",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const upstream = await fetch(`${config.arenaApiUrl}/api/arena/contests/${contest.id}/review-data`, {
      headers: { "x-arena-sync-secret": config.arenaSyncSecret },
    });
    if (!upstream.ok) throw conflict("Could not load review data from Arena");
    const data = await upstream.json();
    res.json(data);
  })
);

contestRouter.post(
  "/:id/participants/:userId/review",
  validateBody(z.object({ decision: z.enum(["clean", "cheating_confirmed"]) })),
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const upstream = await fetch(
      `${config.arenaApiUrl}/api/arena/contests/${contest.id}/participants/${req.params.userId}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-arena-sync-secret": config.arenaSyncSecret },
        body: JSON.stringify(req.body),
      }
    );
    if (!upstream.ok) throw conflict("Could not record the review decision");
    const data = (await upstream.json()) as { reviewStatus: string };
    await audit(req.staff!.id, "contest.arena_review", "contest", contest.id, {
      participantId: req.params.userId,
      decision: data.reviewStatus,
    });
    res.json(data);
  })
);
