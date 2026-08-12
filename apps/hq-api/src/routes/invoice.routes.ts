import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";

// Billing rides on the "clients" permission rather than a dedicated one:
// it's a sub-resource of the client record, not a distinct feature area.
//
// No router-wide requireAuth/.requirePermission() here: this router shares
// the bare "/api" mount prefix with provisioningRouter (see app.ts). A
// path-less .use() on one router matches every request forwarded to that
// router regardless of whether one of ITS OWN routes ends up matching, so a
// router-wide guard here would wrongly gate provisioningRouter's routes
// behind "clients" instead of "provisioning" (the exact bug already fixed
// once in apps/api/src/routes/integrity.routes.ts). Each route below
// carries its own guard instead.
export const invoiceRouter = Router();

const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue"] as const;

invoiceRouter.post(
  "/clients/:clientId/invoices",
  requireAuth,
  requirePermission("clients"),
  validateBody(
    z.object({
      amountCents: z.number().int().min(0),
      dueDate: z.coerce.date().optional(),
      notes: z.string().max(2000).optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const client = await prisma.client.findUnique({ where: { id: req.params.clientId } });
    if (!client) throw notFound("Client not found");
    const invoice = await prisma.invoice.create({
      data: { clientId: client.id, ...req.body },
    });
    res.status(201).json({ invoice });
  })
);

invoiceRouter.put(
  "/invoices/:id",
  requireAuth,
  requirePermission("clients"),
  validateBody(
    z.object({
      status: z.enum(INVOICE_STATUSES).optional(),
      dueDate: z.coerce.date().nullable().optional(),
      notes: z.string().max(2000).optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Invoice not found");
    const body = req.body as { status?: (typeof INVOICE_STATUSES)[number] };
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        paidAt: body.status === "paid" && existing.status !== "paid" ? new Date() : undefined,
      },
    });
    res.json({ invoice });
  })
);
