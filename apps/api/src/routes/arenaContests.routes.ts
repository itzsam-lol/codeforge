import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/errors";
import { requireArenaAuth, optionalArenaAuth } from "../middleware/arenaAuth";
import { validateBody, validateQuery } from "../middleware/validate";
import { snapshotLimiter } from "../middleware/rateLimit";
import { parseArenaCodingConfig, parseArenaMcqConfig, publicMcqOptions } from "../services/arenaSettings";
import { putObject } from "../lib/s3";

export const arenaContestsRouter = Router();

interface ContestCachePayload {
  contestId: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  scoringMode: string;
  proctoringLevel: string;
  webcamRequired: boolean;
  fullscreenRequired: boolean;
  webcamBonusPct: number;
  lockdownBonusPct: number;
  startAt: string;
  endAt: string;
  questions: {
    contestQuestionId: string;
    seq: number;
    type: "coding" | "mcq";
    title: string;
    bodyMd: string;
    difficulty: string;
    points: number;
    typeConfig: unknown;
    editorial?: string | null;
  }[];
}

/** Public list summary — omits question bodies (only shown once a contest
 *  is actually live/registered-for, via the detail endpoint). */
function summarize(row: { contestId: string; status: string; startAt: Date; endAt: Date; payload: unknown }) {
  const p = row.payload as ContestCachePayload;
  return {
    contestId: row.contestId,
    slug: p.slug,
    title: p.title,
    description: p.description,
    status: row.status,
    startAt: row.startAt,
    endAt: row.endAt,
    questionCount: p.questions.length,
    proctoringLevel: p.proctoringLevel,
  };
}

arenaContestsRouter.get(
  "/",
  validateQuery(z.object({ status: z.enum(["live", "scheduled", "completed"]).optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.query as { status?: string };
    const rows = await prisma.arenaContestCache.findMany({
      where: status ? { status } : { status: { in: ["scheduled", "live", "grading", "completed"] } },
      orderBy: { startAt: "desc" },
      take: 100,
    });
    res.json({ contests: rows.map(summarize) });
  })
);

async function loadContestOr404(slug: string) {
  const row = await prisma.arenaContestCache.findUnique({ where: { slug } });
  if (!row) throw notFound("Contest not found");
  return row;
}

arenaContestsRouter.get(
  "/:slug",
  optionalArenaAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const row = await loadContestOr404(req.params.slug);
    const p = row.payload as unknown as ContestCachePayload;
    const isLiveOrPast = ["live", "grading", "completed"].includes(row.status);

    const [myParticipation, registeredCount] = await Promise.all([
      req.arenaUser
        ? prisma.arenaParticipation.findUnique({
            where: { userId_contestId: { userId: req.arenaUser.id, contestId: row.contestId } },
          })
        : Promise.resolve(null),
      prisma.arenaParticipation.count({ where: { contestId: row.contestId } }),
    ]);

    // Best status per question for the logged-in participant, so the
    // compete page's question tabs can show accepted/attempted/untouched
    // (FEAT-7) without a separate round-trip.
    let questionStatus: Record<string, "accepted" | "attempted"> | null = null;
    if (myParticipation) {
      const subs = await prisma.arenaSubmission.findMany({
        where: { contestId: row.contestId, userId: req.arenaUser!.id, contestQuestionId: { not: null } },
        select: { contestQuestionId: true, status: true },
      });
      questionStatus = {};
      for (const s of subs) {
        const qid = s.contestQuestionId!;
        if (s.status === "accepted") questionStatus[qid] = "accepted";
        else if (!questionStatus[qid]) questionStatus[qid] = "attempted";
      }
    }

    res.json({
      contestId: row.contestId,
      slug: p.slug,
      title: p.title,
      description: p.description,
      status: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      scoringMode: p.scoringMode,
      proctoringLevel: p.proctoringLevel,
      webcamRequired: p.webcamRequired,
      fullscreenRequired: p.fullscreenRequired,
      webcamBonusPct: p.webcamBonusPct,
      lockdownBonusPct: p.lockdownBonusPct,
      registeredCount,
      // Problem statements only once the contest has actually started (or
      // ended, for post-contest review) — never before, so registering
      // early doesn't leak questions.
      questions: isLiveOrPast
        ? p.questions
            .slice()
            .sort((a, b) => a.seq - b.seq)
            .map((q) => ({ contestQuestionId: q.contestQuestionId, seq: q.seq, type: q.type, title: q.title, bodyMd: q.bodyMd, difficulty: q.difficulty, points: q.points }))
        : p.questions
            .slice()
            .sort((a, b) => a.seq - b.seq)
            .map((q) => ({ contestQuestionId: q.contestQuestionId, seq: q.seq, type: q.type, title: q.title, difficulty: q.difficulty, points: q.points })),
      myParticipation: myParticipation
        ? {
            status: myParticipation.status,
            score: myParticipation.score,
            rank: myParticipation.rank,
            chosenProctoringLevel: myParticipation.chosenProctoringLevel,
            questionStatus: questionStatus ?? {},
          }
        : null,
    });
  })
);

/** Editor-facing detail for one question — languages/starter code/sample
 *  cases only (never hidden test case content). Requires the contest to be
 *  live/past, same visibility rule as the problem list on the detail
 *  endpoint above, so this can't be used to peek at an upcoming contest's
 *  problems either. */
arenaContestsRouter.get(
  "/:slug/questions/:questionId",
  asyncHandler(async (req: Request, res: Response) => {
    const row = await loadContestOr404(req.params.slug);
    if (!["live", "grading", "completed"].includes(row.status)) {
      throw conflict("This contest hasn't started yet");
    }
    const p = row.payload as unknown as ContestCachePayload;
    const question = p.questions.find((q) => q.contestQuestionId === req.params.questionId);
    if (!question) throw notFound("Question not found");
    // Only once the contest is over — an editorial before then would just
    // be the answer key for a round still in progress.
    const editorial = row.status === "completed" ? question.editorial ?? null : null;

    if (question.type === "mcq") {
      const mcq = parseArenaMcqConfig(question.typeConfig);
      if (!mcq) throw badRequest("This problem is misconfigured, contact support");
      res.json({
        contestId: row.contestId,
        contestQuestionId: question.contestQuestionId,
        type: "mcq",
        title: question.title,
        bodyMd: question.bodyMd,
        difficulty: question.difficulty,
        points: question.points,
        editorial,
        ...publicMcqOptions(mcq),
      });
      return;
    }

    const cfg = parseArenaCodingConfig(question.typeConfig);
    if (!cfg) throw badRequest("This problem is misconfigured, contact support");
    res.json({
      contestId: row.contestId,
      contestQuestionId: question.contestQuestionId,
      type: "coding",
      title: question.title,
      bodyMd: question.bodyMd,
      difficulty: question.difficulty,
      points: question.points,
      editorial,
      languages: cfg.languages,
      starterCode: cfg.starterCode,
      sampleCases: cfg.testCases.filter((tc) => !tc.isHidden).map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput })),
    });
  })
);

arenaContestsRouter.post(
  "/:slug/register",
  requireArenaAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const row = await loadContestOr404(req.params.slug);
    if (!["scheduled", "live"].includes(row.status)) {
      throw conflict("Registration is not open for this contest");
    }
    const existing = await prisma.arenaParticipation.findUnique({
      where: { userId_contestId: { userId: req.arenaUser!.id, contestId: row.contestId } },
    });
    if (existing) throw conflict("You're already registered for this contest");

    const participation = await prisma.arenaParticipation.create({
      data: {
        userId: req.arenaUser!.id,
        contestId: row.contestId,
        status: row.status === "live" ? "active" : "registered",
      },
    });
    res.status(201).json({ participation: { status: participation.status } });
  })
);

/**
 * Proctor-to-Earn: locks in a rating multiplier before the participant
 * starts submitting. Only valid pre-commitment (no prior submission in this
 * contest) so nobody can wait to see the problems are easy before opting
 * into a bonus, or bail on lockdown mid-contest after struggling.
 */
arenaContestsRouter.post(
  "/:slug/proctoring-level",
  requireArenaAuth,
  validateBody(z.object({ level: z.enum(["none", "webcam", "lockdown"]) })),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await loadContestOr404(req.params.slug);
    const p = row.payload as unknown as ContestCachePayload;
    const participation = await prisma.arenaParticipation.findUnique({
      where: { userId_contestId: { userId: req.arenaUser!.id, contestId: row.contestId } },
    });
    if (!participation) throw conflict("Register for this contest before choosing a proctoring level");
    if (!["registered", "active"].includes(participation.status)) {
      throw conflict("This contest is no longer accepting proctoring-level changes");
    }
    const hasSubmitted = await prisma.arenaSubmission.count({
      where: { participationId: participation.id },
    });
    if (hasSubmitted > 0) {
      throw conflict("Your proctoring level is locked in once you've made your first submission");
    }

    const { level } = req.body as { level: "none" | "webcam" | "lockdown" };
    const bonusPct = level === "webcam" ? p.webcamBonusPct : level === "lockdown" ? p.lockdownBonusPct : 0;
    const ratingMultiplier = 1 + bonusPct / 100;

    await prisma.arenaParticipation.update({
      where: { id: participation.id },
      data: { chosenProctoringLevel: level, ratingMultiplier },
    });
    res.json({ chosenProctoringLevel: level, ratingMultiplier });
  })
);

const snapshotSchema = z.object({ imageBase64: z.string().min(100).max(2_000_000) });

/** Periodic webcam snapshot upload — only meaningful once a participant has
 *  chosen "webcam" or "lockdown" (the client only calls this then, but the
 *  server doesn't hard-require it: a snapshot from a "none"-level
 *  participant is just stored without triggering analysis, harmless). */
arenaContestsRouter.post(
  "/:slug/snapshot",
  requireArenaAuth,
  snapshotLimiter,
  validateBody(snapshotSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await loadContestOr404(req.params.slug);
    const participation = await prisma.arenaParticipation.findUnique({
      where: { userId_contestId: { userId: req.arenaUser!.id, contestId: row.contestId } },
    });
    if (!participation) throw conflict("Register for this contest before uploading a snapshot");

    const { imageBase64 } = req.body as z.infer<typeof snapshotSchema>;
    const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(b64, "base64");
    if (buffer.length < 100 || buffer.length > 1_500_000) throw badRequest("Snapshot size out of bounds");

    const key = `arena/${participation.id}/${Date.now()}.jpg`;
    await putObject(key, buffer, "image/jpeg");

    if (participation.chosenProctoringLevel !== "none") {
      const { enqueueAnalyzeArenaSnapshot } = await import("../jobs/queues");
      await enqueueAnalyzeArenaSnapshot(participation.id, key);
    }
    res.status(201).json({ ok: true });
  })
);

arenaContestsRouter.get(
  "/:slug/leaderboard",
  asyncHandler(async (req: Request, res: Response) => {
    const row = await loadContestOr404(req.params.slug);
    const p = row.payload as unknown as ContestCachePayload;
    const participations = await prisma.arenaParticipation.findMany({
      where: { contestId: row.contestId, status: { in: ["active", "submitted"] } },
      include: { user: { select: { handle: true, name: true, rating: true, avatarUrl: true } } },
      orderBy: [{ score: "desc" }, { registeredAt: "asc" }],
      take: 200,
    });

    // Per-question solve status for every participant shown, so the
    // standings can render a green check / red X / gray dash per column
    // (FEAT-3/FEAT-7) instead of just the total score.
    const subs = await prisma.arenaSubmission.findMany({
      where: { contestId: row.contestId, userId: { in: participations.map((pt) => pt.userId) }, contestQuestionId: { not: null } },
      select: { userId: true, contestQuestionId: true, status: true },
    });
    const statusByUser = new Map<string, Record<string, "accepted" | "attempted">>();
    for (const s of subs) {
      const qid = s.contestQuestionId!;
      const forUser = statusByUser.get(s.userId) ?? {};
      if (s.status === "accepted") forUser[qid] = "accepted";
      else if (!forUser[qid]) forUser[qid] = "attempted";
      statusByUser.set(s.userId, forUser);
    }

    res.json({
      questions: p.questions.slice().sort((a, b) => a.seq - b.seq).map((q) => ({ contestQuestionId: q.contestQuestionId, seq: q.seq })),
      leaderboard: participations.map((pt, i) => ({
        rank: pt.rank ?? i + 1,
        handle: pt.user.handle,
        name: pt.user.name,
        avatarUrl: pt.user.avatarUrl,
        rating: pt.user.rating,
        score: pt.score,
        ratingDelta:
          pt.ratingBefore != null && pt.ratingAfter != null ? pt.ratingAfter - pt.ratingBefore : null,
        questionStatus: statusByUser.get(pt.userId) ?? {},
      })),
    });
  })
);
