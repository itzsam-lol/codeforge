import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { audit } from "../services/audit";
import { deleteObject } from "../lib/s3";
import { deleteCandidateDataFromHq } from "../services/support";
import { logger } from "../lib/logger";

/**
 * GDPR Article 17 (right to erasure) for candidate data. super_admin only —
 * this permanently destroys a candidate's history in this org, there's no
 * undo.
 *
 * requireAuth/requireRole are applied per-route, not router-wide: this
 * router shares the bare "/api" mount prefix with resultRouter/
 * integrityRouter (see app.ts), so a router-wide .use() here would run for
 * EVERY "/api/*" request that reaches this point in the middleware chain,
 * not just this router's own route — see integrity.routes.ts's identical
 * comment for the full explanation.
 */
export const gdprRouter = Router();

const bodySchema = z.object({ email: z.string().email() });

gdprRouter.delete(
  "/candidate-data",
  requireAuth,
  requireRole("super_admin"),
  validateBody(bodySchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof bodySchema>;
    const orgId = req.user!.orgId;
    const candidateEmail = email.toLowerCase();

    // Deleting an Invitation cascades through TestSession -> AnswerDraft,
    // Submission (-> JudgeResult, PlagiarismReport), ProctoringEvent,
    // EditorEventBatch, ReviewNote, SessionNote automatically (all
    // onDelete: Cascade in schema.prisma). SupportTicket is NOT
    // cascade-linked (SetNull on candidateSessionId) and has its own
    // candidateEmail column, so it's deleted independently below — and a
    // "codeforge"-channel ticket also has a mirrored copy in HQ's own
    // database (see deleteCandidateDataFromHq below), which this org's own
    // deletes can never reach.
    const invitations = await prisma.invitation.findMany({
      where: { candidateEmail, test: { orgId } },
      select: { id: true, session: { select: { id: true } } },
    });
    const sessionIds = invitations.map((i) => i.session?.id).filter((id): id is string => Boolean(id));

    // S3 has no prefix-list helper — snapshot keys only exist in
    // ProctoringEvent.metadata, so they must be recovered before the
    // cascade above removes those rows.
    let snapshotsDeleted = 0;
    if (sessionIds.length > 0) {
      const snapshotEvents = await prisma.proctoringEvent.findMany({
        where: { sessionId: { in: sessionIds }, eventType: { in: ["identity_snapshot", "webcam_snapshot"] } },
        select: { metadata: true },
      });
      for (const e of snapshotEvents) {
        const key = (e.metadata as { key?: string } | null)?.key;
        if (!key) continue;
        try {
          await deleteObject(key);
          snapshotsDeleted++;
        } catch (err) {
          // Best-effort: one failed S3 delete shouldn't abort the whole
          // erasure request — log it and keep going.
          logger.error({ err, key }, "gdpr candidate-data delete: failed to remove S3 snapshot");
        }
      }
    }

    const [ticketsResult, invitationsResult] = await prisma.$transaction([
      prisma.supportTicket.deleteMany({ where: { orgId, candidateEmail } }),
      prisma.invitation.deleteMany({ where: { id: { in: invitations.map((i) => i.id) } } }),
    ]);

    // The local SupportTicket delete above only reaches this deployment's
    // own database — a "codeforge"-channel ticket also gets mirrored into
    // HQ's separate database (services/support.ts's syncNewTicketToHq),
    // which this deployment can't DELETE FROM directly. Best-effort, same
    // as the S3 cleanup above: erasure has already succeeded locally by
    // this point, so a failure here is logged, not fatal to the request.
    const hqTicketsDeleted = await deleteCandidateDataFromHq(candidateEmail);

    const summary = {
      invitationsDeleted: invitationsResult.count,
      ticketsDeleted: ticketsResult.count,
      hqTicketsDeleted,
      snapshotsDeleted,
    };
    await audit(orgId, req.user!.id, "candidate.data.delete", "candidate", candidateEmail, summary);
    res.json(summary);
  })
);
