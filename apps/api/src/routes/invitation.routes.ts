import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { requireAuth, requireStaffWrite, requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { notifyResultsReadyIfComplete } from "../services/notifications";
import { audit } from "../services/audit";
import { generateCandidateToken, hashToken } from "../lib/tokens";
import { sendInvitationEmail } from "../lib/email";
import { config } from "../config";

/** Actions on individual invitations (revoke / extend). */
export const invitationRouter = Router();
invitationRouter.use(requireAuth, requireStaffWrite, requirePermission("invitations"));

async function findOrgInvitation(id: string, orgId: string) {
  const inv = await prisma.invitation.findFirst({
    where: { id, test: { orgId } },
    include: { session: true, test: { select: { title: true } } },
  });
  if (!inv) throw notFound("Invitation not found");
  return inv;
}

/**
 * Issues a fresh capability token and re-sends the invitation email — the
 * token itself is the candidate's live session credential (see schema
 * comment on Invitation.tokenHash), so this is blocked once any session row
 * exists: rotating the token out from under an in-progress candidate would
 * 401 every request they make for the rest of the test. Newer invitations
 * never expose their raw token again after creation, so this is also how a
 * recruiter gets a copyable link for a row that already lost it (e.g. the
 * original email bounced).
 */
invitationRouter.post(
  "/:id/resend",
  asyncHandler(async (req, res) => {
    const inv = await findOrgInvitation(req.params.id, req.user!.orgId);
    if (inv.session) throw badRequest("Candidate already started this test — can't rotate an active link");
    if (inv.status === "revoked") throw badRequest("This invitation was revoked");
    if (inv.status === "completed") throw badRequest("Candidate already completed the test");

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.user!.orgId } });
    const token = generateCandidateToken();
    const expiresAt = inv.expiresAt < new Date() ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : inv.expiresAt;
    const updated = await prisma.invitation.update({
      where: { id: inv.id },
      data: {
        token: null,
        tokenHash: hashToken(token),
        expiresAt,
        status: inv.status === "expired" ? "pending" : inv.status,
      },
    });
    const link = `${config.webOrigin}/t/${token}`;
    await sendInvitationEmail({
      to: inv.candidateEmail,
      candidateName: inv.candidateName,
      testTitle: inv.test.title,
      orgName: org.name,
      link,
      expiresAt,
    });
    res.json({ invitation: updated, link });
  })
);

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
