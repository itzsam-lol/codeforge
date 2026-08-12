import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound, unauthorized } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { config } from "../config";
import { sendSupportReplyEmail } from "../lib/email";
import { syncMessageToHq, syncNewTicketToHq } from "../services/support";
import { notify } from "../services/notify";
import { logger } from "../lib/logger";

export const supportRouter = Router();

const TICKET_LIST_SELECT = {
  id: true,
  channel: true,
  status: true,
  priority: true,
  subject: true,
  candidateName: true,
  candidateEmail: true,
  createdAt: true,
  updatedAt: true,
  assignedToUser: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} as const;

supportRouter.get(
  "/",
  requireAuth,
  requirePermission("support"),
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const tickets = await prisma.supportTicket.findMany({
      where: { orgId: req.user!.orgId, status: status ? (status as never) : undefined },
      select: TICKET_LIST_SELECT,
      orderBy: { updatedAt: "desc" },
    });
    res.json({ tickets });
  })
);

/** Shared-secret auth for HQ posting a reply back into this org's ticket. Not
 *  requireAuth/requirePermission — this is a service-to-service call, same
 *  posture as the marketing-site-to-HQ lead ingest it mirrors. */
function requireHqSupportSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = req.headers["x-hq-support-secret"];
  if (!config.hqSupportIngestSecret || secret !== config.hqSupportIngestSecret) {
    return next(unauthorized("Invalid support sync secret"));
  }
  next();
}

// Registered before the "/:id" and "/:id/messages" routes below: Express
// matches path patterns in registration order, and "/:id/messages" would
// otherwise shadow "/ingest/messages" (matching it with id="ingest"),
// sending this service-to-service call through requireAuth instead.
supportRouter.post(
  "/ingest/messages",
  requireHqSupportSecret,
  validateBody(
    z.object({
      originTicketId: z.string().min(1),
      authorName: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
      status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { originTicketId, authorName, body, status } = req.body as {
      originTicketId: string;
      authorName: string;
      body: string;
      status?: string;
    };
    const ticket = await prisma.supportTicket.findUnique({ where: { id: originTicketId } });
    if (!ticket) throw badRequest("Unknown ticket");

    await prisma.supportMessage.create({
      data: { ticketId: ticket.id, authorType: "codeforge", authorName, body },
    });
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: (status as never) ?? "pending", resolvedAt: status === "resolved" ? new Date() : undefined },
    });

    if (ticket.candidateEmail) {
      sendSupportReplyEmail({
        to: ticket.candidateEmail,
        candidateName: ticket.candidateName ?? "there",
        subject: ticket.subject,
        replyFrom: authorName,
        body,
      }).catch((err) => logger.error({ err, ticketId: ticket.id }, "[support] reply email failed"));
    }

    notify(ticket.orgId, "support_reply", "New reply on a support ticket", `${authorName}: ${ticket.subject}`, "/support");

    res.status(201).json({ ok: true });
  })
);

supportRouter.get(
  "/:id",
  requireAuth,
  requirePermission("support"),
  asyncHandler(async (req: Request, res: Response) => {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        assignedToUser: { select: { id: true, name: true } },
      },
    });
    if (!ticket) throw notFound("Ticket not found");
    res.json({ ticket });
  })
);

supportRouter.post(
  "/",
  requireAuth,
  requirePermission("support"),
  validateBody(z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(5000) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { subject, body } = req.body as { subject: string; body: string };
    const ticket = await prisma.supportTicket.create({
      data: {
        orgId: req.user!.orgId,
        channel: "codeforge",
        subject,
        openedByUserId: req.user!.id,
        messages: {
          create: { authorType: "staff", authorId: req.user!.id, authorName: req.user!.name, body },
        },
      },
      include: { messages: true },
    });
    syncNewTicketToHq({
      originTicketId: ticket.id,
      subject,
      candidateEmail: null,
      candidateName: null,
      firstMessage: { authorType: "staff", authorName: req.user!.name, body },
    });
    res.status(201).json({ ticket });
  })
);

supportRouter.post(
  "/:id/messages",
  requireAuth,
  requirePermission("support"),
  validateBody(z.object({ body: z.string().min(1).max(5000) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { body } = req.body as { body: string };
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!ticket) throw notFound("Ticket not found");

    await prisma.supportMessage.create({
      data: { ticketId: ticket.id, authorType: "staff", authorId: req.user!.id, authorName: req.user!.name, body },
    });
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: ticket.status === "open" ? "pending" : ticket.status },
    });

    if (ticket.channel === "codeforge") {
      syncMessageToHq({ originTicketId: ticket.id, authorType: "staff", authorName: req.user!.name, body });
    }
    if (ticket.candidateEmail) {
      sendSupportReplyEmail({
        to: ticket.candidateEmail,
        candidateName: ticket.candidateName ?? "there",
        subject: ticket.subject,
        replyFrom: req.user!.name,
        body,
      }).catch((err) => logger.error({ err, ticketId: ticket.id }, "[support] reply email failed"));
    }

    res.status(201).json({ ok: true });
  })
);

supportRouter.put(
  "/:id",
  requireAuth,
  requirePermission("support"),
  validateBody(
    z.object({
      status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
      assignedToUserId: z.string().nullable().optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, assignedToUserId } = req.body as { status?: string; assignedToUserId?: string | null };
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id, orgId: req.user!.orgId },
    });
    if (!ticket) throw notFound("Ticket not found");

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: status as never,
        assignedToUserId,
        resolvedAt: status === "resolved" ? new Date() : status ? null : undefined,
      },
    });
    res.json({ ticket: updated });
  })
);

