import { config } from "../config";
import { logger } from "./logger";

/**
 * Deployment health alerts, dispatched to whichever channels are
 * configured. Both channels are optional and independent — a fresh install
 * with neither HQ_ALERT_EMAIL nor HQ_ALERT_SLACK_WEBHOOK_URL set just logs,
 * same graceful-degradation posture as every other optional integration in
 * this repo (apps/api/src/lib/email.ts, marketing's Resend/HQ dual-write).
 */

async function sendEmail(subject: string, text: string): Promise<void> {
  if (!config.alertEmail) return;
  if (config.emailDriver === "resend" && config.resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.emailFrom, to: config.alertEmail, subject, text }),
      });
      if (res.ok) return;
      logger.error({ status: res.status }, "[alerts:email] resend send failed");
    } catch (err) {
      logger.error({ err }, "[alerts:email] resend request failed");
    }
  }
  logger.info({ to: config.alertEmail, subject, text }, "[alerts:email:console]");
}

async function sendSlack(text: string): Promise<void> {
  if (!config.alertSlackWebhookUrl) return;
  try {
    const res = await fetch(config.alertSlackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) logger.error({ status: res.status }, "[alerts:slack] webhook send failed");
  } catch (err) {
    logger.error({ err }, "[alerts:slack] webhook request failed");
  }
}

export interface DeploymentAlert {
  companyName: string;
  appDomain: string;
  healthy: boolean;
  detail: string | null;
}

export async function sendDeploymentAlert(alert: DeploymentAlert): Promise<void> {
  const headline = alert.healthy
    ? `${alert.companyName}'s deployment is reachable again`
    : `${alert.companyName}'s deployment is unreachable`;
  const detail = [
    headline,
    `Domain: ${alert.appDomain}`,
    alert.detail ? `Detail: ${alert.detail}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.all([sendEmail(headline, detail), sendSlack(`${alert.healthy ? ":white_check_mark:" : ":rotating_light:"} ${detail}`)]);
}

export interface RenewalReminderAlert {
  companyName: string;
  clientId: string;
  nextRenewalDate: Date;
  daysUntil: number;
  mrrCents: number | null;
}

/** Notifies HQ staff (not the client) so a human follows up — deliberately
 *  not a client-facing email, same posture as the record-keeping-only note
 *  on Client.mrrCents: nothing here should look like it initiated contact
 *  with the client on CodeForge's behalf. */
export async function sendRenewalReminderAlert(alert: RenewalReminderAlert): Promise<void> {
  const headline = `${alert.companyName}'s renewal is in ${alert.daysUntil} day${alert.daysUntil === 1 ? "" : "s"}`;
  const mrr = alert.mrrCents != null ? `$${(alert.mrrCents / 100).toFixed(2)}/mo` : "MRR not on file";
  const detail = [
    headline,
    `Renewal date: ${alert.nextRenewalDate.toLocaleDateString()}`,
    mrr,
    `Client: /clients/${alert.clientId}`,
  ].join("\n");

  await Promise.all([sendEmail(headline, detail), sendSlack(`:bell: ${detail}`)]);
}
