import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { logger } from "../lib/logger";

/**
 * Gemini practice-mode hint, authenticated with a plain API key
 * (GOOGLE_AI_API_KEY) rather than a service-account key/ADC — see
 * services/arenaVision.ts's matching comment for why. Never called during a
 * live contest (routes/arenaPractice.routes.ts only) — a hint mechanism in
 * a scored competitive round would undermine the whole point of a rating.
 * No-ops (returns null) whenever no key is configured, same posture as
 * hq-api's services/aiQuestion.ts.
 */

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI | null {
  if (!config.googleAiApiKey) return null;
  if (!client) client = new GoogleGenerativeAI(config.googleAiApiKey);
  return client;
}

export async function getCodeHint(params: { bodyMd: string; code: string; language: string }): Promise<string | null> {
  const genAI = getClient();
  if (!genAI) return null;

  const prompt = `You are a coding mentor helping someone practice. Give ONE short, pedagogical hint (2-4 sentences) about their next step — point at the concept, data structure, or bug category they should think about. Do NOT write any code, do NOT state the final answer or fix, do NOT reveal the specific edge case that's failing if you can infer it — just point them in the right direction like a good TA would.

Problem:
${params.bodyMd}

Their current ${params.language} code:
${params.code || "(empty — they haven't started)"}

Respond with only the hint text, no preamble.`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContent(prompt);
    return result.response.text()?.trim() || null;
  } catch (err) {
    logger.error({ err }, "[ai] hint generation failed");
    return null;
  }
}
