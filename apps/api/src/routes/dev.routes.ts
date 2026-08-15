import { Router } from "express";
import { renderBrandedEmail } from "../lib/emailTemplate";

/**
 * Visual QA for the branded email templates, with dummy data — mounted only
 * when !config.isProd (see app.ts). No auth: dev-only, never reachable in a
 * real deployment.
 */
export const devRouter = Router();

const DUMMY_EXPIRY = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

const templates: Record<string, () => { html: string }> = {
  invitation: () =>
    renderBrandedEmail({
      orgName: "Acme Corp",
      heading: "You're invited: Senior Backend Engineer",
      bodyLines: [
        "Hi Priya Sharma,",
        `Acme Corp has invited you to take the assessment "Senior Backend Engineer".`,
      ],
      ctaText: "Start the assessment",
      ctaUrl: "https://example.com/t/dummy-token",
      footnote: `This link expires on ${DUMMY_EXPIRY.toISOString()}. It's single-use, so keep it private.`,
    }),
  reminder: () =>
    renderBrandedEmail({
      orgName: "Acme Corp",
      heading: `"Senior Backend Engineer" closes soon`,
      bodyLines: [
        "Hi Priya Sharma,",
        `This is a reminder that your invitation to "Senior Backend Engineer" from Acme Corp expires on ${DUMMY_EXPIRY.toISOString()} and hasn't been completed yet.`,
      ],
      ctaText: "Continue the assessment",
      ctaUrl: "https://example.com/t/dummy-token",
    }),
  completion: () =>
    renderBrandedEmail({
      orgName: "Acme Corp",
      heading: "Submitted: Senior Backend Engineer",
      bodyLines: [
        "Hi Priya Sharma,",
        `Your submission for "Senior Backend Engineer" has been received by Acme Corp.`,
        "The hiring team will review your responses and follow up.",
      ],
    }),
  "password-reset": () =>
    renderBrandedEmail({
      orgName: "CodeForge",
      heading: "Reset your password",
      bodyLines: [
        "Hi Jordan,",
        "Someone requested a password reset for this account. If that was you, set a new password using the link below.",
      ],
      ctaText: "Reset password",
      ctaUrl: "https://example.com/reset/dummy-token",
      footnote: "This link expires in 1 hour. If you didn't request this, you can ignore this email — your password hasn't changed.",
    }),
};

devRouter.get("/email-preview/:template", (req, res) => {
  const render = templates[req.params.template];
  if (!render) {
    res.status(404).send(`Unknown template "${req.params.template}". Available: ${Object.keys(templates).join(", ")}`);
    return;
  }
  res.type("html").send(render().html);
});
