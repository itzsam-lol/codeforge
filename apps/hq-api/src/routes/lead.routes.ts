import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { asyncHandler, badRequest, notFound, unauthorized } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateBody, singleLine } from "../middleware/validate";
import { ingestLimiter } from "../middleware/rateLimit";

export const leadRouter = Router();

const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "dismissed"] as const;

/**
 * Marketing's /api/contact route dual-writes here. No staff session exists
 * on that side, so this route is gated on a shared secret header instead of
 * requireAuth — deliberately NOT under the router-wide auth guard the other
 * routes in this file use.
 */
leadRouter.post(
  "/ingest",
  ingestLimiter,
  validateBody(
    z.object({
      name: z.string().min(1).max(200),
      email: z.string().email(),
      // No line breaks: this value can end up as Client.companyName, which
      // provisioning.ts's envTemplate() interpolates into a remote .env
      // file (which also sanitizes defensively) — rejecting it at the
      // point a public, unauthenticated visitor submits it is the
      // earliest and clearest place to stop it.
      company: singleLine(200).min(1),
      teamSize: z.string().max(50).optional(),
      focus: z.string().max(200).optional(),
      message: z.string().max(2000).optional(),
      intent: z.enum(["demo", "sales"]),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const provided = req.headers["x-hq-ingest-secret"];
    const expected = config.ingestSecret;
    const ok =
      typeof provided === "string" &&
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) throw unauthorized("Invalid ingest secret");

    const lead = await prisma.lead.create({ data: req.body });
    res.status(201).json({ id: lead.id });
  })
);

leadRouter.use(requireAuth, requirePermission("leads"));

leadRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const leads = await prisma.lead.findMany({
      where: status ? { status: status as (typeof LEAD_STATUSES)[number] } : undefined,
      orderBy: { createdAt: "desc" },
    });
    res.json({ leads });
  })
);

/** Bulk status change. "converted" is deliberately excluded — that status is
 *  only reachable through POST /:id/convert, which also creates the Client
 *  record; setting it directly here would leave a lead marked converted
 *  with no client behind it. */
leadRouter.post(
  "/bulk",
  validateBody(
    z.object({
      leadIds: z.array(z.string().min(1)).min(1).max(200),
      status: z.enum(["contacted", "qualified", "dismissed"]),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { leadIds, status } = req.body as { leadIds: string[]; status: "contacted" | "qualified" | "dismissed" };
    const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } } });
    for (const lead of leads) {
      await prisma.lead.update({ where: { id: lead.id }, data: { status } });
    }
    res.json({ ok: true, updated: leads.length, skipped: leadIds.length - leads.length });
  })
);

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Formula-injection guard: a value starting with =, +, -, or @ would
  // otherwise execute as a formula when opened in Excel/Sheets. Prefixing
  // with a tab defuses it while staying visually invisible.
  if (/^[=+\-@]/.test(s)) s = "\t" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

leadRouter.get(
  "/export.csv",
  asyncHandler(async (req: Request, res: Response) => {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
    const header = ["Name", "Email", "Company", "Team size", "Focus", "Intent", "Status", "Message", "Received"];
    const lines = [header.join(",")];
    for (const l of leads) {
      lines.push(
        [
          csvCell(l.name),
          csvCell(l.email),
          csvCell(l.company),
          csvCell(l.teamSize),
          csvCell(l.focus),
          csvCell(l.intent),
          csvCell(l.status),
          csvCell(l.message),
          csvCell(l.createdAt.toISOString()),
        ].join(",")
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="leads.csv"`);
    res.send(lines.join("\n"));
  })
);

leadRouter.put(
  "/:id",
  validateBody(z.object({ status: z.enum(LEAD_STATUSES) })),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Lead not found");
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { status: (req.body as { status: (typeof LEAD_STATUSES)[number] }).status },
    });
    res.json({ lead });
  })
);

leadRouter.post(
  "/:id/convert",
  asyncHandler(async (req: Request, res: Response) => {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) throw notFound("Lead not found");
    if (lead.clientId) throw badRequest("This lead has already been converted");

    const client = await prisma.client.create({
      data: {
        companyName: lead.company,
        contactName: lead.name,
        contactEmail: lead.email,
        status: "lead",
        notes: lead.message ?? undefined,
      },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "converted", clientId: client.id },
    });
    await prisma.clientActivity.create({
      data: {
        clientId: client.id,
        authorId: req.staff!.id,
        type: "system",
        body: `Converted from a ${lead.intent === "demo" ? "demo request" : "sales inquiry"} lead submitted via the marketing site.`,
      },
    });
    res.status(201).json({ client });
  })
);
