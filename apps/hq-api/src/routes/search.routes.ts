import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { validateQuery } from "../middleware/validate";

/**
 * Backs the top-bar CommandPalette's live search — mirrors apps/api's
 * search.routes.ts. Read-only, ungated beyond requireAuth like the
 * dashboard (HQ has no per-staff tenant boundary by design).
 */
export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get(
  "/",
  validateQuery(z.object({ q: z.string().min(1).max(100) })),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query.q as string;
    const [clients, leads] = await Promise.all([
      prisma.client.findMany({
        where: { companyName: { contains: q, mode: "insensitive" } },
        select: { id: true, companyName: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.lead.findMany({
        where: {
          OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }],
        },
        select: { id: true, name: true, company: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    res.json({
      results: [
        ...clients.map((c) => ({ label: c.companyName, href: `/clients/${c.id}`, group: "Clients" })),
        // Leads have no individual detail page — they're managed inline on
        // the list page — so this links there rather than to a 404.
        ...leads.map((l) => ({ label: `${l.name} · ${l.company}`, href: "/leads", group: "Leads" })),
      ],
    });
  })
);
