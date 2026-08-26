import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, conflict, notFound } from "../lib/errors";
import { requireArenaAuth } from "../middleware/arenaAuth";
import { validateBody } from "../middleware/validate";

/**
 * FEAT-10: per-contest discussion threads. Flat reply lists (no nesting) —
 * a forum, not a full comment tree, matching the scope of everything else
 * added this pass. Visible under the same rule the problems themselves
 * already follow (loadContestOr404 in arenaContests.routes.ts): a contest
 * that hasn't started yet has nothing worth discussing publicly.
 */
export const arenaForumRouter = Router();

async function loadContestForForum(slug: string) {
  const row = await prisma.arenaContestCache.findUnique({ where: { slug } });
  if (!row) throw notFound("Contest not found");
  if (!["live", "grading", "completed"].includes(row.status)) {
    throw conflict("Discussion opens once the contest starts");
  }
  return row;
}

arenaForumRouter.get(
  "/contests/:slug/threads",
  asyncHandler(async (req: Request, res: Response) => {
    const row = await loadContestForForum(req.params.slug);
    const threads = await prisma.arenaForumThread.findMany({
      where: { contestId: row.contestId },
      include: { user: { select: { handle: true, name: true } }, _count: { select: { replies: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    res.json({
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title,
        pinned: t.pinned,
        createdAt: t.createdAt,
        authorHandle: t.user.handle,
        authorName: t.user.name,
        replyCount: t._count.replies,
      })),
    });
  })
);

const threadSchema = z.object({ title: z.string().min(1).max(200), bodyMd: z.string().min(1).max(10_000) });

arenaForumRouter.post(
  "/contests/:slug/threads",
  requireArenaAuth,
  validateBody(threadSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await loadContestForForum(req.params.slug);
    const body = req.body as z.infer<typeof threadSchema>;
    const thread = await prisma.arenaForumThread.create({
      data: { contestId: row.contestId, userId: req.arenaUser!.id, title: body.title, bodyMd: body.bodyMd },
    });
    res.status(201).json({ thread: { id: thread.id } });
  })
);

arenaForumRouter.get(
  "/threads/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const thread = await prisma.arenaForumThread.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { handle: true, name: true } } },
    });
    if (!thread) throw notFound("Thread not found");
    const [replies, contest] = await Promise.all([
      prisma.arenaForumReply.findMany({
        where: { threadId: thread.id },
        include: { user: { select: { handle: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.arenaContestCache.findUnique({ where: { contestId: thread.contestId }, select: { slug: true } }),
    ]);
    res.json({
      thread: {
        id: thread.id,
        title: thread.title,
        bodyMd: thread.bodyMd,
        pinned: thread.pinned,
        createdAt: thread.createdAt,
        authorHandle: thread.user.handle,
        authorName: thread.user.name,
        contestSlug: contest?.slug ?? null,
      },
      replies: replies.map((r) => ({
        id: r.id,
        bodyMd: r.bodyMd,
        createdAt: r.createdAt,
        authorHandle: r.user.handle,
        authorName: r.user.name,
      })),
    });
  })
);

const replySchema = z.object({ bodyMd: z.string().min(1).max(10_000) });

arenaForumRouter.post(
  "/threads/:id/replies",
  requireArenaAuth,
  validateBody(replySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const thread = await prisma.arenaForumThread.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!thread) throw notFound("Thread not found");
    const body = req.body as z.infer<typeof replySchema>;
    const reply = await prisma.arenaForumReply.create({
      data: { threadId: thread.id, userId: req.arenaUser!.id, bodyMd: body.bodyMd },
    });
    res.status(201).json({ reply: { id: reply.id } });
  })
);
