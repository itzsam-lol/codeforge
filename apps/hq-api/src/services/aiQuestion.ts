import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { logger } from "../lib/logger";

/**
 * Gemini question generator for the HQ contest builder. Authenticates with
 * a plain API key (GOOGLE_AI_API_KEY), not a service-account key/ADC — many
 * GCP orgs (particularly credit-program-provisioned projects) enforce the
 * iam.disableServiceAccountKeyCreation org policy, which blocks minting
 * service-account keys but has no effect on API keys.
 *
 * Never auto-saves — returns a draft for a staff member to review/edit
 * before it's actually created through the normal POST /:id/questions
 * route, same reasoning as any AI-authored content in a hiring-adjacent
 * product: a human stays in the loop before it reaches candidates.
 *
 * No-ops (returns null, not a thrown error) whenever no key is configured —
 * this feature is optional infrastructure, not a hard dependency for
 * contest creation to work.
 */

export interface DraftCodingQuestion {
  type: "coding";
  title: string;
  bodyMd: string;
  difficulty: "easy" | "medium" | "hard";
  typeConfig: {
    languages: string[];
    starterCode: Record<string, string>;
    timeLimitMs: number;
    memoryLimitKb: number;
    testCases: { input: string; expectedOutput: string; isHidden: boolean; weight: number }[];
  };
}

export interface DraftMcqQuestion {
  type: "mcq";
  title: string;
  bodyMd: string;
  difficulty: "easy" | "medium" | "hard";
  typeConfig: {
    options: { id: string; text: string }[];
    correctOptionIds: string[];
    multiple: boolean;
  };
}

export type DraftQuestion = DraftCodingQuestion | DraftMcqQuestion;

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI | null {
  if (!config.googleAiApiKey) return null;
  if (!client) client = new GoogleGenerativeAI(config.googleAiApiKey);
  return client;
}

function extractJson(text: string): unknown {
  // Gemini sometimes wraps JSON in a ```json fence despite instructions not
  // to — strip it defensively rather than failing generation over formatting.
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
  return JSON.parse(fenced ? fenced[1] : text);
}

function codingPrompt(difficulty: string, topic: string): string {
  return `You are generating a competitive-programming problem for a coding contest platform.
Difficulty: ${difficulty}. Topic: ${topic || "any well-known algorithmic topic appropriate for this difficulty"}.

Respond with ONLY a raw JSON object (no markdown fence, no commentary) matching exactly this shape:
{
  "title": "short problem title",
  "bodyMd": "full problem statement in markdown, including input/output format and constraints",
  "languages": ["javascript", "python", "cpp", "java", "c", "go"],
  "starterCode": { "javascript": "// starter code for javascript" },
  "timeLimitMs": 2000,
  "memoryLimitKb": 128000,
  "testCases": [
    { "input": "stdin content", "expectedOutput": "expected stdout", "isHidden": false, "weight": 1 },
    { "input": "...", "expectedOutput": "...", "isHidden": true, "weight": 1 }
  ]
}
Include at least 4 testCases (at least 1 visible sample, the rest hidden). Test cases must be genuinely correct for the stated problem — verify the expected output by reasoning through the problem statement yourself before writing it.`;
}

function mcqPrompt(difficulty: string, topic: string): string {
  return `You are generating a multiple-choice CS-fundamentals question for a coding contest platform.
Difficulty: ${difficulty}. Topic: ${topic || "any well-known CS fundamentals topic appropriate for this difficulty"}.

Respond with ONLY a raw JSON object (no markdown fence, no commentary) matching exactly this shape:
{
  "title": "short question title",
  "bodyMd": "the question text in markdown",
  "options": [{ "id": "a", "text": "option text" }, { "id": "b", "text": "option text" }, { "id": "c", "text": "option text" }, { "id": "d", "text": "option text" }],
  "correctOptionIds": ["b"],
  "multiple": false
}
Exactly 4 options unless the question genuinely needs more. correctOptionIds must reference ids that exist in options.`;
}

export async function generateContestQuestion(params: {
  type: "coding" | "mcq";
  difficulty: "easy" | "medium" | "hard";
  topic: string;
}): Promise<DraftQuestion | null> {
  const genAI = getClient();
  if (!genAI) return null;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = params.type === "coding" ? codingPrompt(params.difficulty, params.topic) : mcqPrompt(params.difficulty, params.topic);
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text) return null;
    const parsed = extractJson(text) as Record<string, unknown>;

    if (params.type === "coding") {
      return {
        type: "coding",
        title: String(parsed.title ?? "Untitled problem"),
        bodyMd: String(parsed.bodyMd ?? ""),
        difficulty: params.difficulty,
        typeConfig: {
          languages: Array.isArray(parsed.languages) ? (parsed.languages as string[]) : [],
          starterCode: (parsed.starterCode as Record<string, string>) ?? {},
          timeLimitMs: Number(parsed.timeLimitMs) || 2000,
          memoryLimitKb: Number(parsed.memoryLimitKb) || 128000,
          testCases: Array.isArray(parsed.testCases) ? (parsed.testCases as DraftCodingQuestion["typeConfig"]["testCases"]) : [],
        },
      };
    }
    return {
      type: "mcq",
      title: String(parsed.title ?? "Untitled question"),
      bodyMd: String(parsed.bodyMd ?? ""),
      difficulty: params.difficulty,
      typeConfig: {
        options: Array.isArray(parsed.options) ? (parsed.options as { id: string; text: string }[]) : [],
        correctOptionIds: Array.isArray(parsed.correctOptionIds) ? (parsed.correctOptionIds as string[]) : [],
        multiple: Boolean(parsed.multiple),
      },
    };
  } catch (err) {
    logger.error({ err, params }, "[ai] question generation failed");
    return null;
  }
}
