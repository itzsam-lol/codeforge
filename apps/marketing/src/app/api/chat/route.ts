import { NextRequest } from "next/server";

/**
 * Server-side only: the Groq key never reaches the browser. This route is
 * the one place that calls Groq; the client just POSTs the conversation.
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `You are the assistant on CodeForge's marketing site (codeforge.io). CodeForge is a
self-hosted, white-label technical assessment platform for hiring: one deployment per client, own
database, own domain, own branding. It supports six assessment types (DSA/coding, MCQ/MSQ,
frontend UI, bug fix, API/backend challenge, repo project), proctoring/integrity signals, and
plagiarism detection. There is no public self-serve pricing or signup, sales are demo/contact-led
(support@codeforge.io). Answer only questions about CodeForge, hiring/technical-assessment
workflows, or how to get in touch. If asked something unrelated, politely redirect back to
CodeForge. Keep answers short (2-4 sentences) and never invent pricing figures or features that
don't exist above.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1000;

// Best-effort per-IP rate limit. Serverless instances are ephemeral, so this
// resets on cold start, it's a deterrent against casual abuse, not a hard
// guarantee, good enough for a marketing-site widget's expected traffic.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

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
    return Response.json({ error: "Too many messages, please slow down." }, { status: 429 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Chat is not configured." }, { status: 503 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0 || messages.length > MAX_MESSAGES) {
    return Response.json({ error: "Invalid message list." }, { status: 400 });
  }
  for (const m of messages) {
    if (
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      m.content.length === 0 ||
      m.content.length > MAX_MESSAGE_CHARS
    ) {
      return Response.json({ error: "Invalid message." }, { status: 400 });
    }
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      return Response.json({ error: "The assistant is temporarily unavailable." }, { status: 502 });
    }

    const data = await res.json();
    const reply: string = data.choices?.[0]?.message?.content ?? "";
    return Response.json({ reply });
  } catch {
    return Response.json({ error: "The assistant is temporarily unavailable." }, { status: 502 });
  }
}
