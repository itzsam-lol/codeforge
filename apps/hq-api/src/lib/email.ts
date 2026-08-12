import { config } from "../config";
import { logger } from "./logger";

/**
 * General-purpose (arbitrary-recipient) email abstraction — distinct from
 * lib/alerts.ts, which only ever sends to the fixed HQ_ALERT_EMAIL inbox.
 * Same driver/fallback shape as apps/api/src/lib/email.ts: "console" (default)
 * logs instead of sending, "resend" sends for real and falls back to logging
 * on failure so a flaky provider never silently drops the message.
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
        headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.emailFrom, to: msg.to, subject: msg.subject, text: msg.text }),
      });
      if (res.ok) return;
      logger.error({ status: res.status, to: msg.to }, "[email:resend] send failed");
    } catch (err) {
      logger.error({ err, to: msg.to }, "[email:resend] request failed");
    }
  }
  logger.info({ email: { from: config.emailFrom, ...msg } }, "[email:console]");
}

export interface PasswordResetEmail {
  to: string;
  name: string;
  link: string;
}

/** Sent when an HQ staff account requests a password reset. */
export async function sendPasswordResetEmail(msg: PasswordResetEmail): Promise<void> {
  await dispatch({
    to: msg.to,
    subject: "Reset your CodeForge HQ password",
    text: [
      `Hi ${msg.name},`,
      ``,
      `Someone requested a password reset for this HQ account. If that was you, set a new password here:`,
      msg.link,
      ``,
      `This link expires in 1 hour. If you didn't request this, you can ignore this email — your password hasn't changed.`,
    ].join("\n"),
  });
}

export interface NewSupportTicketAlert {
  companyName: string;
  subject: string;
  fromName: string;
  body: string;
}

/** Sent to the fixed HQ_ALERT_EMAIL inbox when a client reports a technical
 *  issue (routes/support.routes.ts) — reuses the same alert address as
 *  deployment-health alerts (lib/alerts.ts) rather than adding a second
 *  configurable recipient for one more thing. No-op if HQ_ALERT_EMAIL unset,
 *  same as every alert channel in this app. */
export async function sendNewSupportTicketAlert(msg: NewSupportTicketAlert): Promise<void> {
  if (!config.alertEmail) return;
  await dispatch({
    to: config.alertEmail,
    subject: `[Support] ${msg.companyName}: ${msg.subject}`,
    text: [`New support ticket from ${msg.companyName} (${msg.fromName}):`, ``, msg.body].join("\n"),
  });
}
