import { config } from "../config";
import { logger } from "./logger";

/**
 * Email abstraction. Phase 1 ships only the "console" driver, which logs the
 * message instead of sending it (invitation links are also surfaced in the
 * recruiter UI for copy-paste). Phase 4 swaps in Resend/Postmark/SES behind
 * this same interface.
 */

export interface InvitationEmail {
  to: string;
  candidateName: string;
  testTitle: string;
  orgName: string;
  link: string;
  expiresAt: Date;
}

export async function sendInvitationEmail(msg: InvitationEmail): Promise<void> {
  if (config.emailDriver === "console") {
    logger.info(
      {
        email: {
          from: config.emailFrom,
          to: msg.to,
          subject: `You're invited: ${msg.testTitle} — ${msg.orgName}`,
          link: msg.link,
          expiresAt: msg.expiresAt.toISOString(),
        },
      },
      "[email:console] invitation"
    );
  }
}
