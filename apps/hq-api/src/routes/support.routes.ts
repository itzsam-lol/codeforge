import { Router, type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound, unauthorized } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { serviceLimiter } from "../middleware/rateLimit";
import { config } from "../config";
import { sendNewSupportTicketAlert } from "../lib/email";
import { notify } from "../services/notify";
import { logger } from "../lib/logger";

export const supportRouter = Router();

const TICKET_LIST_SELECT = {
  id: true,
  status: true,
  priority: true,
  subject: true,
  candidateName: true,
  candidateEmail: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, companyName: true } },
  assignedToStaff: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} as const;

const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;

supportRouter.get(
  "/",
  requireAuth,
  requirePermission("support"),
  validateQuery(z.object({ status: z.enum(TICKET_STATUSES).optional(), clientId: z.string().optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const tickets = await prisma.supportTicket.findMany({
      where: { status: status ? (status as never) : undefined, clientId },
      select: TICKET_LIST_SELECT,
      orderBy: { updatedAt: "desc" },
    });
    res.json({ tickets });
  })
);

/** Shared-secret auth for a client deployment's apps/api posting into HQ's
 *  inbox — service-to-service, not staff auth, same posture as leads/ingest. */
function requireSupportIngestSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = req.headers["x-hq-support-secret"];
  const expected = config.supportIngestSecret;
  const ok =
    Boolean(expected) &&
    typeof secret === "string" &&
    secret.length === expected!.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected!));
  if (!ok) return next(unauthorized("Invalid support sync secret"));
  next();
}

// Both registered before "/:id" and "/:id/messages" below: Express matches
// path patterns in registration order, and "/:id/messages" would otherwise
// shadow "/ingest/messages" (matching it with id="ingest"), sending this
// service-to-service call through requireAuth instead.
supportRouter.post(
  "/ingest",
  serviceLimiter,
  requireSupportIngestSecret,
  validateBody(
    z.object({
      clientId: z.string().min(1),
      originTicketId: z.string().min(1),
      originApiUrl: z.string().url(),
      subject: z.string().min(1).max(200),
      candidateEmail: z.string().email().nullable().optional(),
      candidateName: z.string().max(200).nullable().optional(),
      firstMessage: z.object({
        authorType: z.string(),
        authorName: z.string(),
        body: z.string(),
      }),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, originTicketId, originApiUrl, subject, candidateEmail, candidateName, firstMessage } =
      req.body as {
        clientId: string;
        originTicketId: string;
        originApiUrl: string;
        subject: string;
        candidateEmail?: string | null;
        candidateName?: string | null;
        firstMessage: { authorType: string; authorName: string; body: string };
      };

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, companyName: true } });
    if (!client) throw badRequest("Unknown client");

    const ticket = await prisma.supportTicket.create({
      data: {
        clientId,
        originTicketId,
        originApiUrl,
        subject,
        candidateEmail: candidateEmail ?? null,
        candidateName: candidateName ?? null,
        messages: {
          create: {
            authorType: firstMessage.authorType,
            authorName: firstMessage.authorName,
            body: firstMessage.body,
          },
        },
      },
    });

    sendNewSupportTicketAlert({
      companyName: client.companyName,
      subject,
      fromName: firstMessage.authorName,
      body: firstMessage.body,
    }).catch((err) => logger.error({ err, ticketId: ticket.id }, "[support] new-ticket alert failed"));

    notify("support_ticket_new", "New support ticket", `${client.companyName}: ${subject}`, "/support");

    res.status(201).json({ ok: true, ticketId: ticket.id });
  })
);

supportRouter.post(
  "/ingest/messages",
  serviceLimiter,
  requireSupportIngestSecret,
  validateBody(
    z.object({
      originTicketId: z.string().min(1),
      authorType: z.string().optional(),
      authorName: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { originTicketId, authorType, authorName, body } = req.body as {
      originTicketId: string;
      authorType?: string;
      authorName: string;
      body: string;
    };
    const ticket = await prisma.supportTicket.findUnique({ where: { originTicketId } });
    if (!ticket) throw badRequest("Unknown ticket");

    await prisma.supportMessage.create({
      data: { ticketId: ticket.id, authorType: authorType ?? "staff", authorName, body },
    });
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: ticket.status === "resolved" || ticket.status === "closed" ? "open" : ticket.status },
    });

    res.status(201).json({ ok: true });
  })
);

supportRouter.get(
  "/:id",
  requireAuth,
  requirePermission("support"),
  asyncHandler(async (req: Request, res: Response) => {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, companyName: true } },
        assignedToStaff: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) throw notFound("Ticket not found");
    res.json({ ticket });
  })
);

supportRouter.put(
  "/:id",
  requireAuth,
  requirePermission("support"),
  validateBody(
    z.object({
      status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
      assignedToStaffId: z.string().nullable().optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, assignedToStaffId } = req.body as { status?: string; assignedToStaffId?: string | null };
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw notFound("Ticket not found");

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: status as never,
        assignedToStaffId,
        resolvedAt: status === "resolved" ? new Date() : status ? null : undefined,
      },
    });
    res.json({ ticket: updated });
  })
);

supportRouter.post(
  "/:id/messages",
  requireAuth,
  requirePermission("support"),
  validateBody(z.object({ body: z.string().min(1).max(5000) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { body } = req.body as { body: string };
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw notFound("Ticket not found");

    await prisma.supportMessage.create({
      data: { ticketId: ticket.id, authorType: "codeforge", authorId: req.staff!.id, authorName: req.staff!.name, body },
    });
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: ticket.status === "open" ? "pending" : ticket.status },
    });

    // Best-effort reply-back to the client's own apps/api, same
    // fire-and-forget posture as the client->HQ direction (services/support.ts
    // on that side) — a delivery failure here never fails this staff reply,
    // it only means the client's copy lags until the next sync succeeds.
    if (config.supportIngestSecret) {
      fetch(`${ticket.originApiUrl}/api/support/ingest/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hq-support-secret": config.supportIngestSecret },
        body: JSON.stringify({ originTicketId: ticket.originTicketId, authorName: req.staff!.name, body }),
      }).catch((err) => logger.error({ err, ticketId: ticket.id }, "[support] reply-back to client failed"));
    }

    res.status(201).json({ ok: true });
  })
);
