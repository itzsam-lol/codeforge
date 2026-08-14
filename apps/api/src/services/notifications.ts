import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { config } from "../config";
import { sendReminderEmail, sendResultsReadyEmail } from "../lib/email";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Repeatable sweep (spec 3.9): reminds candidates ~24h before an unfinished
 * invitation expires. `remindedAt` makes this idempotent across sweep runs.
 */
export async function sendDueReminders(): Promise<number> {
  const now = new Date();
  const due = await prisma.invitation.findMany({
    where: {
      status: { in: ["pending", "opened", "started"] },
      remindedAt: null,
      expiresAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
      test: { status: "published" },
      isPreview: false,
    },
    include: { test: { include: { org: true } } },
  });

  for (const inv of due) {
    try {
      await sendReminderEmail({
        to: inv.candidateEmail,
        candidateName: inv.candidateName,
        testTitle: inv.test.title,
        orgName: inv.test.org.name,
        link: `${config.webOrigin}/t/${inv.token}`,
        expiresAt: inv.expiresAt,
      });
      await prisma.invitation.update({ where: { id: inv.id }, data: { remindedAt: now } });
    } catch (err) {
      logger.error({ err, invitationId: inv.id }, "reminder email failed");
    }
  }
  return due.length;
}

const TERMINAL_INVITATION_STATUSES = ["completed", "expired", "revoked"];

/**
 * Fires the recruiter "results ready" email exactly once, the first moment
 * every invitation on a test has reached a terminal state (spec 3.9). Safe to
 * call after any invitation-status change, cheap no-op the rest of the time.
 */
export async function notifyResultsReadyIfComplete(testId: string): Promise<void> {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      createdBy: true,
      invitations: { where: { isPreview: false }, select: { status: true } },
    },
  });
  if (!test || test.resultsNotifiedAt || test.invitations.length === 0) return;
  const allTerminal = test.invitations.every((i) => TERMINAL_INVITATION_STATUSES.includes(i.status));
  if (!allTerminal) return;

  const claimed = await prisma.test.updateMany({
    where: { id: testId, resultsNotifiedAt: null },
    data: { resultsNotifiedAt: new Date() },
  });
  if (claimed.count === 0) return; // another caller already claimed it

  const completedCount = test.invitations.filter((i) => i.status === "completed").length;
  try {
    await sendResultsReadyEmail({
      to: test.createdBy.email,
      recruiterName: test.createdBy.name,
      testTitle: test.title,
      completedCount,
      totalInvited: test.invitations.length,
      resultsUrl: `${config.webOrigin}/tests/${test.id}`,
    });
  } catch (err) {
    logger.error({ err, testId }, "results-ready email failed");
  }
}
