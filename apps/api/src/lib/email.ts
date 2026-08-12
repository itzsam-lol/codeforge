import { config } from "../config";
import { logger } from "./logger";

/**
 * Email abstraction. "console" (default) logs the message instead of sending
 * it; invitation links are also surfaced in the recruiter UI for copy-paste,
 * so nothing is lost in dev. "resend" sends for real via the Resend HTTP API
 * (no SDK dependency, just fetch); it falls back to logging if the request
 * fails so a flaky provider never silently drops an invite/reminder.
 */

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

async function dispatch(msg: EmailMessage): Promise<void> {
  if (config.emailDriver === "resend" && config.resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.emailFrom,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
        }),
      });
      if (res.ok) return;
      logger.error({ status: res.status, to: msg.to }, "[email:resend] send failed");
    } catch (err) {
      logger.error({ err, to: msg.to }, "[email:resend] request failed");
    }
  }
  logger.info({ email: { from: config.emailFrom, ...msg } }, "[email:console]");
}

export interface InvitationEmail {
  to: string;
  candidateName: string;
  testTitle: string;
  orgName: string;
  link: string;
  expiresAt: Date;
}

export async function sendInvitationEmail(msg: InvitationEmail): Promise<void> {
  await dispatch({
    to: msg.to,
    subject: `You're invited: ${msg.testTitle} (${msg.orgName})`,
    text: [
      `Hi ${msg.candidateName},`,
      ``,
      `${msg.orgName} has invited you to take the assessment "${msg.testTitle}".`,
      `Start here: ${msg.link}`,
      ``,
      `This link expires on ${msg.expiresAt.toISOString()}. It's single-use, so keep it private.`,
    ].join("\n"),
  });
}

export interface ReminderEmail {
  to: string;
  candidateName: string;
  testTitle: string;
  orgName: string;
  link: string;
  expiresAt: Date;
}

/** Sent ~24h before an unstarted/incomplete invitation expires. */
export async function sendReminderEmail(msg: ReminderEmail): Promise<void> {
  await dispatch({
    to: msg.to,
    subject: `Reminder: "${msg.testTitle}" closes soon`,
    text: [
      `Hi ${msg.candidateName},`,
      ``,
      `This is a reminder that your invitation to "${msg.testTitle}" from ${msg.orgName}`,
      `expires on ${msg.expiresAt.toISOString()} and hasn't been completed yet.`,
      `Continue here: ${msg.link}`,
    ].join("\n"),
  });
}

export interface CandidateCompletionEmail {
  to: string;
  candidateName: string;
  testTitle: string;
  orgName: string;
}

/** Sent to the candidate immediately after their session finalizes. */
export async function sendCandidateCompletionEmail(msg: CandidateCompletionEmail): Promise<void> {
  await dispatch({
    to: msg.to,
    subject: `Submitted: ${msg.testTitle}`,
    text: [
      `Hi ${msg.candidateName},`,
      ``,
      `Your submission for "${msg.testTitle}" has been received by ${msg.orgName}.`,
      `The hiring team will review your responses and follow up.`,
    ].join("\n"),
  });
}

export interface PasswordResetEmail {
  to: string;
  name: string;
  link: string;
}

/** Sent when a staff account requests a password reset. */
export async function sendPasswordResetEmail(msg: PasswordResetEmail): Promise<void> {
  await dispatch({
    to: msg.to,
    subject: "Reset your CodeForge password",
    text: [
      `Hi ${msg.name},`,
      ``,
      `Someone requested a password reset for this account. If that was you, set a new password here:`,
      msg.link,
      ``,
      `This link expires in 1 hour. If you didn't request this, you can ignore this email — your password hasn't changed.`,
    ].join("\n"),
  });
}

export interface NewSupportTicketEmail {
  to: string;
  subject: string;
  channel: "org" | "codeforge";
  fromName: string;
  body: string;
  testTitle?: string;
}

/** Sent to the org's designated support inbox when a candidate opens an org-channel ticket. */
export async function sendNewSupportTicketEmail(msg: NewSupportTicketEmail): Promise<void> {
  await dispatch({
    to: msg.to,
    subject: `[Support] ${msg.subject}`,
    text: [
      `New support request from ${msg.fromName}${msg.testTitle ? ` (${msg.testTitle})` : ""}:`,
      ``,
      msg.body,
    ].join("\n"),
  });
}

export interface SupportReplyEmail {
  to: string;
  candidateName: string;
  subject: string;
  replyFrom: string;
  body: string;
}

/** Sent to a candidate when their support ticket gets a reply — candidates have no
 *  account to check back on, so this is the only way they see the answer. */
export async function sendSupportReplyEmail(msg: SupportReplyEmail): Promise<void> {
  await dispatch({
    to: msg.to,
    subject: `Re: ${msg.subject}`,
    text: [
      `Hi ${msg.candidateName},`,
      ``,
      `${msg.replyFrom} replied to your support request:`,
      ``,
      msg.body,
    ].join("\n"),
  });
}

export interface ResultsReadyEmail {
  to: string;
  recruiterName: string;
  testTitle: string;
  completedCount: number;
  totalInvited: number;
  resultsUrl: string;
}

/** Sent once to the test's owner when every invitation reaches a terminal state. */
export async function sendResultsReadyEmail(msg: ResultsReadyEmail): Promise<void> {
  await dispatch({
    to: msg.to,
    subject: `Results ready: ${msg.testTitle}`,
    text: [
      `Hi ${msg.recruiterName},`,
      ``,
      `All invited candidates for "${msg.testTitle}" have finished or expired`,
      `(${msg.completedCount}/${msg.totalInvited} completed). Results are ready to review:`,
      msg.resultsUrl,
    ].join("\n"),
  });
}
