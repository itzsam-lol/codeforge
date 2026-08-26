import { z } from "zod";
import { LANGUAGE_IDS } from "@codeforge/shared";

/**
 * Shape of ContestQuestion.typeConfig (hq-api) / ArenaPracticeProblem.typeConfig
 * (this app) — a single JSON blob carrying everything gradeArenaSubmission
 * needs, unlike the client product's normalized Question+TestCase split.
 * Chosen deliberately (see plan section 1): this whole object is what gets
 * copied verbatim across the HQ->apps/api sync, so there's no join to
 * reconstruct on either side.
 */
export const arenaCodingConfigSchema = z.object({
  /** Subset of LANGUAGE_IDS the participant may use. Empty = all supported. */
  languages: z.array(z.enum(LANGUAGE_IDS as [string, ...string[]])).default([]),
  /** Per-language starter code keyed by language id. */
  starterCode: z.record(z.string()).default({}),
  timeLimitMs: z.number().int().min(100).max(15000).default(2000),
  memoryLimitKb: z.number().int().min(16000).max(512000).default(128000),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string(),
        isHidden: z.boolean().default(true),
        weight: z.number().positive().default(1),
      })
    )
    .min(1),
});
export type ArenaCodingConfig = z.infer<typeof arenaCodingConfigSchema>;

/** Tolerant parser, mirrors apps/api's services/settings.ts parseDsaConfig:
 *  never throws on a legacy/malformed blob, falls back to an empty-but-valid
 *  shape (empty testCases will just fail with a clear "no test cases" error
 *  at grading time rather than crashing the request). */
export function parseArenaCodingConfig(json: unknown): ArenaCodingConfig | null {
  const r = arenaCodingConfigSchema.safeParse(json ?? {});
  return r.success ? r.data : null;
}

export function assertLanguageAllowed(cfg: ArenaCodingConfig, language: string): void {
  if (cfg.languages.length > 0 && !cfg.languages.includes(language)) {
    throw new Error(`Language "${language}" is not allowed for this problem`);
  }
}

/** MCQ counterpart to arenaCodingConfigSchema — same "single typeConfig
 *  blob" convention, selected via ContestQuestion.type === "mcq". Mirrors
 *  the shape of the client product's mcqConfigSchema (@codeforge/shared)
 *  closely enough to be familiar, but kept Arena-local rather than shared
 *  since Arena has no per-question negative-marking/time-limit concept. */
export const arenaMcqConfigSchema = z
  .object({
    options: z
      .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
      .min(2)
      .max(10),
    correctOptionIds: z.array(z.string()).min(1),
    multiple: z.boolean().default(false),
  })
  .superRefine((cfg, ctx) => {
    const optionIds = new Set(cfg.options.map((o) => o.id));
    for (const id of cfg.correctOptionIds) {
      if (!optionIds.has(id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `correctOptionIds contains unknown option id "${id}"` });
      }
    }
    if (!cfg.multiple && cfg.correctOptionIds.length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Single-select MCQ must have exactly one correct option" });
    }
  });
export type ArenaMcqConfig = z.infer<typeof arenaMcqConfigSchema>;

export function parseArenaMcqConfig(json: unknown): ArenaMcqConfig | null {
  const r = arenaMcqConfigSchema.safeParse(json ?? {});
  return r.success ? r.data : null;
}

/** The shape sent to the client for an MCQ question — options only, never
 *  correctOptionIds (mirrors how coding hidden test cases are never sent). */
export function publicMcqOptions(cfg: ArenaMcqConfig): { options: { id: string; text: string }[]; multiple: boolean } {
  return { options: cfg.options, multiple: cfg.multiple };
}

export function scoreMcqSubmission(cfg: ArenaMcqConfig, selectedOptionIds: string[]): boolean {
  const correct = new Set(cfg.correctOptionIds);
  const selected = new Set(selectedOptionIds);
  if (correct.size !== selected.size) return false;
  for (const id of correct) if (!selected.has(id)) return false;
  return true;
}
