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
  validateQuery(
    z.object({ status: z.enum(CONTEST_STATUSES).optional(), search: z.string().optional(), templates: z.coerce.boolean().optional() })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, search, templates } = req.query as { status?: string; search?: string; templates?: boolean };
    const contests = await prisma.contest.findMany({
      where: {
        status: status ? (status as (typeof CONTEST_STATUSES)[number]) : undefined,
        title: search ? { contains: search, mode: "insensitive" } : undefined,
        // FEAT-8: templates are contests that never go live themselves —
        // keep them out of the normal contest list unless explicitly asked
        // for via ?templates=true (the Templates page).
        isTemplate: templates ?? false,
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
  maxStrikes: z.number().int().min(1).max(50).optional(),
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

type LoadedContest = Awaited<ReturnType<typeof loadContestWithQuestions>>;

/** Shared by /duplicate, /save-as-template, and /templates/:id/use below —
 *  all three are "clone this contest's settings + questions into a fresh
 *  draft" with only the title/isTemplate flag differing. New contest always
 *  gets a fresh slug and placeholder schedule (the schema's NOT NULL
 *  startAt/endAt require *something*), status stays "draft" so it can't go
 *  live until staff deliberately reschedules and publishes. */
async function cloneContest(source: LoadedContest, title: string, isTemplate: boolean, staffId: string) {
  const slug = await generateUniqueSlug(title);
  const placeholderStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const placeholderEnd = new Date(placeholderStart.getTime() + 60 * 60 * 1000);
  return prisma.contest.create({
    data: {
      title,
      slug,
      description: source.description,
      scoringMode: source.scoringMode,
      proctoringLevel: source.proctoringLevel,
      webcamRequired: source.webcamRequired,
      fullscreenRequired: source.fullscreenRequired,
      webcamBonusPct: source.webcamBonusPct,
      lockdownBonusPct: source.lockdownBonusPct,
      maxStrikes: source.maxStrikes,
      isPublic: source.isPublic,
      isTemplate,
      startAt: placeholderStart,
      endAt: placeholderEnd,
      createdByStaffId: staffId,
      questions: {
        create: source.questions.map((q) => ({
          seq: q.seq,
          type: q.type,
          title: q.title,
          bodyMd: q.bodyMd,
          difficulty: q.difficulty,
          points: q.points,
          typeConfig: q.typeConfig as Prisma.InputJsonValue,
          editorial: q.editorial,
        })),
      },
    },
  });
}

/** Clones a contest's settings and questions into a new draft — saves staff
 *  from rebuilding a recurring weekly contest from scratch every time. */
contestRouter.post(
  "/:id/duplicate",
  asyncHandler(async (req: Request, res: Response) => {
    const source = await loadContestWithQuestions(req.params.id);
    const clone = await cloneContest(source, `${source.title} (Copy)`, false, req.staff!.id);
    await audit(req.staff!.id, "contest.duplicate", "contest", clone.id, { sourceContestId: source.id });
    res.status(201).json({ contest: clone });
  })
);

// ---------------------------------------------------------------------------
// FEAT-8: contest templates — a template is just a contest with
// isTemplate: true, filtered out of the normal list (see GET / above),
// that staff "use" to spin up a fresh draft instead of a normal duplicate.
// ---------------------------------------------------------------------------

contestRouter.post(
  "/:id/save-as-template",
  asyncHandler(async (req: Request, res: Response) => {
    const source = await loadContestWithQuestions(req.params.id);
    const template = await cloneContest(source, `${source.title} (Template)`, true, req.staff!.id);
    await audit(req.staff!.id, "contest.save_as_template", "contest", template.id, { sourceContestId: source.id });
    res.status(201).json({ contest: template });
  })
);

contestRouter.post(
  "/templates/:id/use",
  asyncHandler(async (req: Request, res: Response) => {
    const template = await loadContestWithQuestions(req.params.id);
    if (!template.isTemplate) throw badRequest("This contest isn't a template");
    const clone = await cloneContest(template, template.title.replace(/ \(Template\)$/, ""), false, req.staff!.id);
    await audit(req.staff!.id, "contest.use_template", "contest", clone.id, { templateId: template.id });
    res.status(201).json({ contest: clone });
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
  // Optional markdown solution walkthrough, shown to the public once the
  // contest is completed (see arenaSync.ts + apps/api's question endpoint).
  editorial: z.string().max(50_000).optional(),
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

/** FEAT-9: push a finished contest question into the reusable bank —
 *  independent copy, not a link, so later edits to either don't leak into
 *  the other. */
contestRouter.post(
  "/:id/questions/:qid/save-to-bank",
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.contestQuestion.findFirst({
      where: { id: req.params.qid, contestId: req.params.id },
    });
    if (!existing) throw notFound("Question not found");
    const item = await prisma.questionBankItem.create({
      data: {
        type: existing.type,
        title: existing.title,
        bodyMd: existing.bodyMd,
        difficulty: existing.difficulty,
        points: existing.points,
        typeConfig: existing.typeConfig as Prisma.InputJsonValue,
        editorial: existing.editorial,
        createdByStaffId: req.staff!.id,
      },
    });
    res.status(201).json({ item });
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

const reorderSchema = z.object({ order: z.array(z.string().min(1)).min(1) });

/** Drag-and-drop reordering (BUG-7): `order` is the full list of question
 *  ids in their new sequence — seq becomes each id's 1-based position.
 *  updateMany's compound where (id + contestId) means a stray id from
 *  another contest is silently skipped rather than erroring. */
contestRouter.patch(
  "/:id/questions/reorder",
  validateBody(reorderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const { order } = req.body as z.infer<typeof reorderSchema>;
    await prisma.$transaction(
      order.map((qid, i) =>
        prisma.contestQuestion.updateMany({ where: { id: qid, contestId: contest.id }, data: { seq: i + 1 } })
      )
    );
    res.json({ ok: true });
  })
);

// --- Lifecycle actions ---

contestRouter.post(
  "/:id/publish",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await loadContestWithQuestions(req.params.id);
    if (contest.isTemplate) throw badRequest("Templates can't be published directly — use \"Use template\" to create a contest from it first");
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
  "/:id/analytics",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const upstream = await fetch(`${config.arenaApiUrl}/api/arena/contests/${contest.id}/analytics`, {
      headers: { "x-arena-sync-secret": config.arenaSyncSecret },
    });
    if (!upstream.ok) throw conflict("Could not load analytics from Arena");
    const data = await upstream.json();
    res.json(data);
  })
);

const broadcastSchema = z.object({ message: z.string().min(1).max(2000) });

/** Send a live-contest announcement (BUG-7). Proxied straight through to
 *  apps/api, which is the source of truth (same posture as review-data
 *  above) — no separate broadcasts table here, just an audit log entry. */
contestRouter.post(
  "/:id/broadcast",
  validateBody(broadcastSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const { message } = req.body as z.infer<typeof broadcastSchema>;
    const upstream = await fetch(`${config.arenaApiUrl}/api/arena/contests/${contest.id}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-arena-sync-secret": config.arenaSyncSecret },
      body: JSON.stringify({ message }),
    });
    if (!upstream.ok) throw conflict("Could not send the announcement");
    await audit(req.staff!.id, "contest.broadcast", "contest", contest.id, { message });
    res.status(201).json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// FEAT-7: participant management — proxies apps/api's full-roster endpoint
// (see arenaContestSync.routes.ts), same shared-secret posture as
// review-data/analytics/broadcast above.
// ---------------------------------------------------------------------------

contestRouter.get(
  "/:id/participants",
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const qs = new URLSearchParams();
    if (typeof req.query.search === "string") qs.set("search", req.query.search);
    if (typeof req.query.status === "string") qs.set("status", req.query.status);
    const upstream = await fetch(
      `${config.arenaApiUrl}/api/arena/contests/${contest.id}/participants?${qs.toString()}`,
      { headers: { "x-arena-sync-secret": config.arenaSyncSecret } }
    );
    if (!upstream.ok) throw conflict("Could not load participants from Arena");
    const data = await upstream.json();
    res.json(data);
  })
);

contestRouter.post(
  "/:id/participants/:userId/status",
  validateBody(z.object({ action: z.enum(["disqualify", "reinstate"]) })),
  asyncHandler(async (req: Request, res: Response) => {
    const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
    if (!contest) throw notFound("Contest not found");
    const upstream = await fetch(
      `${config.arenaApiUrl}/api/arena/contests/${contest.id}/participants/${req.params.userId}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-arena-sync-secret": config.arenaSyncSecret },
        body: JSON.stringify(req.body),
      }
    );
    if (!upstream.ok) throw conflict("Could not update this participant");
    const data = (await upstream.json()) as { status: string };
    await audit(req.staff!.id, "contest.participant_status", "contest", contest.id, {
      participantId: req.params.userId,
      action: (req.body as { action: string }).action,
      newStatus: data.status,
    });
    res.json(data);
  })
);

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
