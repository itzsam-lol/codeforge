/**
 * Shared branded-HTML wrapper for outbound emails (spec: every candidate/
 * recruiter-facing email should look like it belongs to the product, not a
 * raw text dump). Table-based layout for Gmail/Outlook/Apple Mail rendering
 * consistency; the plain-text fallback is generated from the same
 * `bodyLines` input as the HTML, so the two can never drift out of sync.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BrandedEmailOptions {
  orgName: string;
  heading: string;
  /** Plain-text paragraphs; "" renders as a blank line / paragraph gap. */
  bodyLines: string[];
  ctaText?: string;
  ctaUrl?: string;
  /** Small print under the CTA, e.g. an expiry note. Rendered smaller/muted. */
  footnote?: string;
}

export function renderBrandedEmail(opts: BrandedEmailOptions): { html: string; text: string } {
  const text = [
    opts.heading,
    "",
    ...opts.bodyLines,
    ...(opts.ctaUrl ? ["", opts.ctaText ? `${opts.ctaText}: ${opts.ctaUrl}` : opts.ctaUrl] : []),
    ...(opts.footnote ? ["", opts.footnote] : []),
    "",
    `— ${opts.orgName}, via CodeForge`,
  ].join("\n");

  const paragraphs = opts.bodyLines
    .map((line) =>
      line
        ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(line)}</p>`
        : `<div style="height:6px;"></div>`
    )
    .join("");

  const cta = opts.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
        <tr><td style="border-radius:8px;background:#4f46e5;">
          <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
            ${escapeHtml(opts.ctaText ?? "Open link")}
          </a>
        </td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
        Or paste this link into your browser: ${escapeHtml(opts.ctaUrl)}
      </p>`
    : "";

  const footnote = opts.footnote
    ? `<p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#94a3b8;">${escapeHtml(opts.footnote)}</p>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:22px 28px;border-bottom:1px solid #e2e8f0;">
                <span style="font-size:13px;font-weight:700;letter-spacing:0.02em;color:#4f46e5;">${escapeHtml(opts.orgName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 16px;font-size:18px;line-height:1.4;color:#0f172a;">${escapeHtml(opts.heading)}</h1>
                ${paragraphs}
                ${cta}
                ${footnote}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e2e8f0;">
                <span style="font-size:11px;color:#94a3b8;">Sent by ${escapeHtml(opts.orgName)} via CodeForge</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, text };
}
