import {
  DEFAULT_TEST_SETTINGS,
  apiChallengeConfigSchema,
  bugFixConfigSchema,
  dsaConfigSchema,
  frontendConfigSchema,
  mcqConfigSchema,
  repoConfigSchema,
  testSettingsSchema,
  type DsaConfig,
  type McqConfig,
  type QuestionType,
  type TestSettings,
} from "@codeforge/shared";
import type { ZodTypeAny } from "zod";

/** Tolerant parsers for JSONB columns — never crash on legacy/partial configs. */

export function parseTestSettings(json: unknown): TestSettings {
  const r = testSettingsSchema.safeParse(json ?? {});
  return r.success ? r.data : DEFAULT_TEST_SETTINGS;
}

export function parseDsaConfig(json: unknown): DsaConfig {
  const r = dsaConfigSchema.safeParse(json ?? {});
  return r.success ? r.data : dsaConfigSchema.parse({});
}

export function parseMcqConfig(json: unknown): McqConfig | null {
  const r = mcqConfigSchema.safeParse(json);
  return r.success ? r.data : null;
}

export const TYPE_CONFIG_SCHEMAS: Record<QuestionType, ZodTypeAny> = {
  dsa: dsaConfigSchema,
  mcq: mcqConfigSchema,
  frontend_ui: frontendConfigSchema,
  bug_fix: bugFixConfigSchema,
  api_challenge: apiChallengeConfigSchema,
  repo_project: repoConfigSchema,
};

/** Generic tolerant parser for any question type's config JSONB. */
export function parseTypeConfig<T>(type: QuestionType, json: unknown): T | null {
  const r = TYPE_CONFIG_SCHEMAS[type].safeParse(json ?? {});
  return r.success ? (r.data as T) : null;
}
