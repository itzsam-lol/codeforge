import { NextRequest } from "next/server";

/**
 * Lead capture for the "Book a demo" / "Contact sales" CTAs site-wide.
 * Server-side only: the Resend key never reaches the browser. Mirrors the
 * driver/fallback shape of apps/api/src/lib/email.ts (raw fetch, no SDK,
 * falls back to a console log rather than dropping the lead) since marketing
 * is a separately deployed app with no access to that codebase.
 */
const RESEND_URL = "https://api.resend.com/emails";

interface ContactBody {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  focus: string;
  message: string;
  intent: "demo" | "sales";
}

const MAX_LEN = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body: Partial<ContactBody>): string | null {
  if (!body.name || body.name.length > 200) return "Enter your name.";
  if (!body.email || !EMAIL_RE.test(body.email) || body.email.length > 320) return "Enter a valid work email.";
  if (!body.company || body.company.length > 200) return "Enter your company name.";
  if (!body.teamSize) return "Select a team size.";
  if (!body.focus) return "Select what you're evaluating.";
  if (body.message && body.message.length > MAX_LEN) return "Message is too long.";
  if (body.intent !== "demo" && body.intent !== "sales") return "Invalid request.";
  return null;
}

// Per-IP in-memory rate limit, same pattern as api/chat/route.ts. Resets on
// cold start; a deterrent against casual abuse, not a hard guarantee - fine
// for a marketing-site form's expected traffic.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return Response.json({ error: "Too many submissions, please try again shortly." }, { status: 429 });
  }

  let body: Partial<ContactBody>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const error = validate(body);
  if (error) return Response.json({ error }, { status: 400 });
  const lead = body as ContactBody;

  const subject =
    lead.intent === "demo" ? `Demo request: ${lead.company}` : `Sales inquiry: ${lead.company}`;
  const text = [
    `Intent: ${lead.intent === "demo" ? "Book a demo" : "Contact sales"}`,
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Company: ${lead.company}`,
    `Team size: ${lead.teamSize}`,
    `Evaluating: ${lead.focus}`,
    ``,
    lead.message?.trim() ? lead.message.trim() : "(no message)",
  ].join("\n");

  // Best-effort dual-write to CodeForge HQ's lead inbox, so sales sees this
  // in the CRM pipeline, not just an email. Never blocks or fails the
  // visitor's submission: HQ being unreachable/unconfigured degrades to
  // "lead only arrived by email," same tolerance as the Resend send below.
  const hqUrl = process.env.HQ_API_URL;
  const hqSecret = process.env.HQ_INGEST_SECRET;
  if (hqUrl && hqSecret) {
    fetch(`${hqUrl}/api/leads/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hq-ingest-secret": hqSecret },
      body: JSON.stringify({
        name: lead.name,
        email: lead.email,
        company: lead.company,
        teamSize: lead.teamSize,
        focus: lead.focus,
        message: lead.message,
        intent: lead.intent,
      }),
    }).catch((err) => console.error("[contact] HQ lead ingest failed", err));
  }

  const notifyTo = process.env.SALES_NOTIFY_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "CodeForge <onboarding@resend.dev>";

  if (!notifyTo) {
    // Not configured: don't fail the visitor's submission over a deployment
    // gap, but make it loud in the server logs so it gets fixed.
    console.warn("[contact] SALES_NOTIFY_EMAIL is not set; lead was received but not delivered", { lead });
    return Response.json({ ok: true });
  }

  if (!apiKey) {
    console.info("[contact:console]", { to: notifyTo, subject, text });
    return Response.json({ ok: true });
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: notifyTo, reply_to: lead.email, subject, text }),
    });
    if (!res.ok) {
      console.error("[contact] resend send failed", { status: res.status });
      console.info("[contact:console]", { to: notifyTo, subject, text });
    }
  } catch (err) {
    console.error("[contact] resend request failed", err);
    console.info("[contact:console]", { to: notifyTo, subject, text });
  }

  return Response.json({ ok: true });
}
