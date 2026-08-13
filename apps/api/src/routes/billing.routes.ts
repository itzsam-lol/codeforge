import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";
import { config } from "../config";
import { logger } from "../lib/logger";

export const billingRouter = Router();

interface HqBillingPayload {
  companyName: string;
  mrrCents: number | null;
  nextRenewalDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  invoices: {
    id: string;
    amountCents: number;
    status: "draft" | "sent" | "paid" | "overdue";
    dueDate: string | null;
    paidAt: string | null;
    notes: string | null;
    createdAt: string;
  }[];
}

/**
 * Server-side proxy to HQ's billing endpoint — the browser never sees
 * HQ_BILLING_SECRET, and this deployment's own staff auth still gates who
 * can see it. Not every deployment is linked to an HQ client (self-hosted
 * installs that were never provisioned through HQ), so this degrades to
 * `{ available: false }` rather than a 500 when the link isn't configured
 * or HQ can't be reached — same resilience posture as the support-ticket
 * sync (services/support.ts).
 */
billingRouter.get(
  "/",
  requireAuth,
  requirePermission("billing"),
  asyncHandler(async (_req: Request, res: Response) => {
    const { hqApiUrl, hqBillingSecret, hqClientId } = config;
    if (!hqApiUrl || !hqBillingSecret || !hqClientId) {
      res.json({ available: false });
      return;
    }
    try {
      const upstream = await fetch(`${hqApiUrl}/api/billing/${hqClientId}`, {
        headers: { "x-hq-billing-secret": hqBillingSecret },
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) {
        logger.warn({ status: upstream.status }, "[billing] HQ billing fetch failed");
        res.json({ available: false });
        return;
      }
      const data = (await upstream.json()) as HqBillingPayload;
      res.json({ available: true, ...data });
    } catch (err) {
      logger.warn({ err }, "[billing] HQ billing fetch failed");
      res.json({ available: false });
    }
  })
);
