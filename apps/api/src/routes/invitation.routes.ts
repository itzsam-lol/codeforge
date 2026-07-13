import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requireStaffWrite } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { notifyResultsReadyIfComplete } from "../services/notifications";
import { audit } from "../services/audit";

/** Actions on individual invitations (revoke / extend). */
export const invitationRouter = Router();
invitationRouter.use(requireAuth, requireStaffWrite);

async function findOrgInvitation(id: string, orgId: string) {
  const inv = await prisma.invitation.findFirst({
    where: { id, test: { orgId } },
    include: { session: true },
  });
  if (!inv) throw notFound("Invitation not found");
  return inv;
}

invitationRouter.post(
  "/:id/revoke",
  asyncHandler(async (req, res) => {
    const inv = await findOrgInvitation(req.params.id, req.user!.orgId);
    if (inv.status === "completed") throw badRequest("Candidate already completed the test");
    const updated = await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "revoked" },
    });
    await audit(req.user!.orgId, req.user!.id, "invitation.revoke", "invitation", inv.id, {
      candidateEmail: inv.candidateEmail,
    });
    await notifyResultsReadyIfComplete(inv.testId).catch(() => undefined);
    res.json({ invitation: updated });
  })
);

invitationRouter.post(
  "/:id/extend",
  validateBody(z.object({ expiresAt: z.coerce.date() })),
  asyncHandler(async (req, res) => {
    const inv = await findOrgInvitation(req.params.id, req.user!.orgId);
    const expiresAt = req.body.expiresAt as Date;
    if (expiresAt < new Date()) throw badRequest("New expiry must be in the future");
    const updated = await prisma.invitation.update({
      where: { id: inv.id },
      data: {
        expiresAt,
        ...(inv.status === "expired" || inv.status === "revoked"
          ? { status: "pending" as const }
          : {}),
      },
    });
    res.json({ invitation: updated });
  })
);
