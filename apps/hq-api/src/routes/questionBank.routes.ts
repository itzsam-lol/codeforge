import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { audit } from "../services/audit";

/**
 * FEAT-9: a reusable question library, decoupled from any single contest —
 * staff can pull a bank item's fields into a new contest question instead of
 * writing from scratch (see QuestionsTab's "Import from bank"), and push a
 * finished contest question back into the bank for reuse (see
 * QuestionEditor's "Save to bank"). Same "contests" permission as the rest
 * of Arena management — this isn't a separate feature area.
 */
export const questionBankRouter = Router();

questionBankRouter.use(requireAuth, requirePermission("contests"));

questionBankRouter.get(
  "/",
  validateQuery(
    z.object({
      search: z.string().max(200).optional(),
      type: z.enum(["coding", "mcq"]).optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { search, type, difficulty } = req.query as { search?: string; type?: string; difficulty?: string };
    const items = await prisma.questionBankItem.findMany({
      where: {
        title: search ? { contains: search, mode: "insensitive" } : undefined,
        type: type as "coding" | "mcq" | undefined,
        difficulty: difficulty as "easy" | "medium" | "hard" | undefined,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    res.json({ items });
  })
);

questionBankRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const item = await prisma.questionBankItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound("Bank item not found");
    res.json({ item });
  })
);

const itemSchema = z.object({
  type: z.enum(["coding", "mcq"]).default("coding"),
  title: z.string().min(1).max(300),
  bodyMd: z.string().min(1).max(50_000),
  difficulty: z.enum(["easy", "medium", "hard"]),
  points: z.number().positive().default(100),
  typeConfig: z.record(z.unknown()),
  editorial: z.string().max(50_000).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

questionBankRouter.post(
  "/",
  validateBody(itemSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof itemSchema>;
    const item = await prisma.questionBankItem.create({
      data: { ...body, typeConfig: body.typeConfig as Prisma.InputJsonValue, createdByStaffId: req.staff!.id },
    });
    await audit(req.staff!.id, "question_bank.create", "question_bank_item", item.id, { title: item.title });
    res.status(201).json({ item });
  })
);

questionBankRouter.patch(
  "/:id",
  validateBody(itemSchema.partial()),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.questionBankItem.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Bank item not found");
    const body = req.body as Partial<z.infer<typeof itemSchema>>;
    const item = await prisma.questionBankItem.update({
      where: { id: existing.id },
      data: { ...body, typeConfig: body.typeConfig as Prisma.InputJsonValue | undefined },
    });
    res.json({ item });
  })
);

questionBankRouter.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.questionBankItem.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Bank item not found");
    await prisma.questionBankItem.delete({ where: { id: existing.id } });
    await audit(req.staff!.id, "question_bank.delete", "question_bank_item", existing.id, { title: existing.title });
    res.json({ ok: true });
  })
);
