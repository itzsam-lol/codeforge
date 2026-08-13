import { Router, type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound, unauthorized } from "../lib/errors";
import { config } from "../config";
import { serviceLimiter } from "../middleware/rateLimit";

/**
 * Read-only, service-to-service (see config.ts's HQ_BILLING_SECRET comment):
 * a client deployment's own apps/api calls this to show that org's staff
 * their own billing summary. Never staff-session-authenticated — there's no
 * HQ staff session on the other end, just the client's backend.
 */
export const billingRouter = Router();

function requireBillingSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = req.headers["x-hq-billing-secret"];
  const expected = config.billingSecret;
  const ok =
    Boolean(expected) &&
    typeof secret === "string" &&
    secret.length === expected!.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected!));
  if (!ok) return next(unauthorized("Invalid billing sync secret"));
  next();
}

billingRouter.get(
  "/:clientId",
  serviceLimiter,
  requireBillingSecret,
  asyncHandler(async (req: Request, res: Response) => {
    const client = await prisma.client.findUnique({
      where: { id: req.params.clientId },
      select: {
        companyName: true,
        mrrCents: true,
        nextRenewalDate: true,
        contractStartDate: true,
        contractEndDate: true,
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, amountCents: true, status: true, dueDate: true, paidAt: true, notes: true, createdAt: true },
        },
      },
    });
    if (!client) throw notFound("Unknown client");
    res.json({ ...client });
  })
);
