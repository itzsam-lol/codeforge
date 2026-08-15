import { z } from "zod";

// ---------------------------------------------------------------------------
// Enumerations (kept as string unions so they serialize cleanly over JSON and
// match the lowercase Prisma enum values 1:1)
// ---------------------------------------------------------------------------

export const ROLES = ["super_admin", "recruiter", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

/** Staff roles allowed to author content. Reviewers are read-only. */
export const STAFF_WRITE_ROLES: Role[] = ["super_admin", "recruiter"];

/**
 * Fine-grained capability checkboxes, one per feature area. A `User`'s
 * `permissions` array (empty = unrestricted within their `role`, see the
 * Prisma schema comment) is a subset of these. Lets a super_admin hand an
 * employee a narrowly-scoped account — e.g. only `questions` — without
 * inventing a new fixed role for every possible combination.
 */
// Note: no "users" key here. Team/user management (apps/api/src/routes/
// user.routes.ts) is deliberately super_admin-only via requireRole, which
// requirePermission always bypasses — a "users" checkbox would grant
// nothing to any non-super_admin account and would only mislead whoever
// checks it into thinking it delegates user management.
export const PERMISSIONS = [
  "questions",
  "tests",
  "invitations",
  "results",
  "integrity",
  "analytics",
  "settings",
  "support",
  "billing",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  questions: "Question bank",
  tests: "Tests (build, publish, close)",
  invitations: "Invitations",
  results: "Results and scoring",
  integrity: "Integrity and plagiarism review",
  analytics: "Analytics",
  settings: "Org settings and branding",
  support: "Support tickets",
  billing: "Billing and invoices",
};

export const QUESTION_TYPES = [
  "dsa",
  "mcq",
  "frontend_ui",
  "bug_fix",
  "api_challenge",
  "repo_project",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** All six question types are implemented as of Phase 3. */
export const IMPLEMENTED_QUESTION_TYPES: QuestionType[] = [
  "dsa",
  "mcq",
  "frontend_ui",
  "bug_fix",
  "api_challenge",
  "repo_project",
];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  dsa: "DSA / Coding",
  mcq: "MCQ / MSQ",
  frontend_ui: "Frontend UI",
  bug_fix: "Bug Fix",
  api_challenge: "API / Backend",
  repo_project: "Repo Project",
};

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const TEST_STATUSES = ["draft", "published", "closed", "archived"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export const INVITATION_STATUSES = [
  "pending",
  "opened",
  "started",
  "completed",
  "expired",
  "revoked",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const SESSION_STATUSES = [
  "created",
  "in_progress",
  "submitted",
  "auto_submitted",
  "expired",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SUBMISSION_STATUSES = ["queued", "running", "graded", "failed"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const PROCTORING_LEVELS = ["none", "basic", "strict", "lockdown"] as const;
export type ProctoringLevel = (typeof PROCTORING_LEVELS)[number];

// ---------------------------------------------------------------------------
// Proctoring events (Phase 2 integrity layer)
// ---------------------------------------------------------------------------

export const PROCTORING_EVENT_TYPES = [
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "fullscreen_enter",
  "paste_blocked",
  "copy_blocked",
  "large_paste",
  "devtools_suspected",
  "multi_monitor",
  "webcam_denied",
  "face_absent",
  "multiple_faces_detected",
  "webcam_snapshot",
  "identity_snapshot",
  "integrity_auto_submit",
  // Hardware/environment integrity checks (one-time, at EnvCheck time): these
  // are signals about the machine/browser itself, not candidate behavior
  // during the test, so they're reported once rather than continuously.
  "vm_suspected",
  "virtual_camera_suspected",
  "automation_browser_suspected",
  "hardware_below_floor",
  "virtual_network_adapter",
  // Continuous re-checks (session-long, not one-time): the environment can
  // legitimately change mid-session in ways EnvCheck alone can't catch — a
  // second display connected after the check passed, a virtual camera that
  // appears later, a remote-desktop reconnect changing the resolution.
  "multi_monitor_change",
  "device_list_changed",
  "resolution_changed",
  "long_idle",
  // CodeForge Sentinel (native companion app, apps/sentinel) events — these
  // are reported by the desktop app, not the browser client, so they're
  // deliberately absent from CLIENT_EVENT_TYPES below (which governs what
  // the browser candidate.routes.ts /events endpoint accepts).
  "sentinel_process_violation",
  "sentinel_vm_detected",
  "sentinel_remote_desktop",
  "sentinel_screen_capture",
  "sentinel_clipboard_violation",
  "sentinel_network_anomaly",
  "sentinel_multi_monitor",
  "sentinel_hotkey_blocked",
  "sentinel_face_missing",
  "sentinel_face_multiple",
  "sentinel_integrity_drift",
  "sentinel_audio_anomaly",
  "sentinel_kiosk_breach",
  "sentinel_heartbeat_lost",
] as const;
export type ProctoringEventType = (typeof PROCTORING_EVENT_TYPES)[number];

/** Event types the candidate client may report; the rest are server-derived. */
export const CLIENT_EVENT_TYPES = [
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "fullscreen_enter",
  "paste_blocked",
  "copy_blocked",
  "devtools_suspected",
  "multi_monitor",
  "webcam_denied",
  "face_absent",
  "multiple_faces_detected",
  "vm_suspected",
  "virtual_camera_suspected",
  "automation_browser_suspected",
  "hardware_below_floor",
  "virtual_network_adapter",
  "multi_monitor_change",
  "device_list_changed",
  "resolution_changed",
  "long_idle",
] as const satisfies readonly ProctoringEventType[];

/** The two hardware/environment checks that force-submit on first occurrence
 * rather than merely scoring a deduction — see `IMMEDIATE_BLOCK_RULES` in the
 * API's candidate routes. Exposed here so the client can render "this will
 * end your session" copy in EnvCheck without duplicating the levels logic. */
export const HARD_BLOCK_EVENT_LEVELS: Partial<Record<ProctoringEventType, ProctoringLevel[]>> = {
  automation_browser_suspected: ["strict", "lockdown"],
  virtual_camera_suspected: ["lockdown"],
};

export const PROCTORING_EVENT_LABELS: Record<ProctoringEventType, string> = {
  tab_switch: "Switched tab / window",
  window_blur: "Window lost focus",
  fullscreen_exit: "Exited fullscreen",
  fullscreen_enter: "Entered fullscreen",
  paste_blocked: "Paste attempt blocked",
  copy_blocked: "Copy attempt blocked",
  large_paste: "Large block inserted at once",
  devtools_suspected: "Devtools possibly opened",
  multi_monitor: "Multiple displays detected",
  webcam_denied: "Camera access denied",
  face_absent: "No face detected in snapshot",
  multiple_faces_detected: "Multiple faces detected in snapshot",
  webcam_snapshot: "Webcam snapshot",
  identity_snapshot: "Identity photo captured",
  integrity_auto_submit: "Auto-submitted by integrity rule",
  vm_suspected: "Virtual machine indicators detected",
  virtual_camera_suspected: "Virtual camera/microphone device detected",
  automation_browser_suspected: "Browser automation indicators detected",
  hardware_below_floor: "Device may be below the recommended hardware floor",
  virtual_network_adapter: "Unusual virtual network adapter detected",
  multi_monitor_change: "A display was connected mid-session",
  device_list_changed: "Camera/microphone device list changed mid-session",
  resolution_changed: "Screen resolution changed mid-session",
  long_idle: "No activity for an extended period",
  sentinel_process_violation: "Prohibited application detected (Sentinel)",
  sentinel_vm_detected: "Virtual machine detected (Sentinel)",
  sentinel_remote_desktop: "Remote desktop software detected (Sentinel)",
  sentinel_screen_capture: "Screenshot attempt blocked (Sentinel)",
  sentinel_clipboard_violation: "External clipboard content blocked (Sentinel)",
  sentinel_network_anomaly: "Unexpected network connection (Sentinel)",
  sentinel_multi_monitor: "Secondary monitor detected (Sentinel)",
  sentinel_hotkey_blocked: "Blocked system shortcut attempt (Sentinel)",
  sentinel_face_missing: "No face detected in webcam (Sentinel)",
  sentinel_face_multiple: "Multiple faces detected in webcam (Sentinel)",
  sentinel_integrity_drift: "Hardware fingerprint changed mid-session (Sentinel)",
  sentinel_audio_anomaly: "Unexpected speech detected (Sentinel)",
  sentinel_kiosk_breach: "Candidate escaped fullscreen lockdown (Sentinel)",
  sentinel_heartbeat_lost: "Sentinel app stopped responding",
};

/**
 * Enforcement thresholds by proctoring level. Lockdown enforces sane defaults
 * even when unset; strict only enforces explicitly configured limits;
 * basic/none never force-submit (log only).
 */
export function proctoringLimits(
  level: ProctoringLevel,
  settings: { maxTabSwitches?: number; maxFullscreenExits?: number }
): { maxTabSwitches?: number; maxFullscreenExits?: number } {
  if (level === "lockdown") {
    return {
      maxTabSwitches: settings.maxTabSwitches ?? 5,
      maxFullscreenExits: settings.maxFullscreenExits ?? 3,
    };
  }
  if (level === "strict") {
    return {
      maxTabSwitches: settings.maxTabSwitches,
      maxFullscreenExits: settings.maxFullscreenExits,
    };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Supported execution languages (Judge0 CE language ids)
// ---------------------------------------------------------------------------

export interface LanguageDef {
  id: string;
  label: string;
  judge0Id: number;
  monacoId: string;
}

export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { id: "javascript", label: "JavaScript (Node.js)", judge0Id: 63, monacoId: "javascript" },
  { id: "typescript", label: "TypeScript", judge0Id: 74, monacoId: "typescript" },
  { id: "python", label: "Python 3", judge0Id: 71, monacoId: "python" },
  { id: "cpp", label: "C++ (GCC)", judge0Id: 54, monacoId: "cpp" },
  { id: "c", label: "C (GCC)", judge0Id: 50, monacoId: "c" },
  { id: "java", label: "Java", judge0Id: 62, monacoId: "java" },
  { id: "csharp", label: "C# (Mono)", judge0Id: 51, monacoId: "csharp" },
  { id: "go", label: "Go", judge0Id: 60, monacoId: "go" },
];

export const LANGUAGE_IDS = SUPPORTED_LANGUAGES.map((l) => l.id);

export function languageById(id: string): LanguageDef | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.id === id);
}

// ---------------------------------------------------------------------------
// Question type_config schemas (stored in Question.typeConfig JSONB)
// ---------------------------------------------------------------------------

export const dsaConfigSchema = z.object({
  /** Subset of LANGUAGE_IDS the candidate may use. Empty = all supported. */
  languages: z.array(z.enum(LANGUAGE_IDS as [string, ...string[]])).default([]),
  /** Per-language starter code keyed by language id. */
  starterCode: z.record(z.string()).default({}),
  timeLimitMs: z.number().int().min(100).max(15000).default(2000),
  memoryLimitKb: z.number().int().min(16000).max(512000).default(128000),
  /**
   * Known public/canonical solutions (reference corpus). The plagiarism engine
   * flags high similarity to these separately from candidate-to-candidate
   * similarity ("found it online" vs "colluded").
   */
  referenceSolutions: z
    .array(z.object({ label: z.string().min(1).max(120), code: z.string().min(1).max(100_000) }))
    .max(10)
    .default([]),
});
export type DsaConfig = z.infer<typeof dsaConfigSchema>;

export const mcqOptionSchema = z.object({
  id: z.string().min(1),
  textMd: z.string().min(1),
  imageUrl: z.string().url().optional(),
});
export type McqOption = z.infer<typeof mcqOptionSchema>;

export const mcqConfigSchema = z
  .object({
    options: z.array(mcqOptionSchema).min(2).max(10),
    correctOptionIds: z.array(z.string()).min(1),
    /** true = multi-select (MSQ) */
    multiple: z.boolean().default(false),
    /** Fraction of the question's points deducted for a wrong answer (0 disables). */
    negativeMarkingPct: z.number().min(0).max(1).default(0),
    perQuestionTimeLimitSec: z.number().int().positive().optional(),
  })
  .superRefine((cfg, ctx) => {
    const optionIds = new Set(cfg.options.map((o) => o.id));
    for (const id of cfg.correctOptionIds) {
      if (!optionIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `correctOptionIds contains unknown option id "${id}"`,
        });
      }
    }
    if (!cfg.multiple && cfg.correctOptionIds.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "single-answer MCQ cannot have multiple correct options",
      });
    }
  });
export type McqConfig = z.infer<typeof mcqConfigSchema>;

// ---------------------------------------------------------------------------
// Phase 3 type configs
// ---------------------------------------------------------------------------

export const frontendAssertionSchema = z.object({
  label: z.string().min(1).max(200),
  type: z.enum(["exists", "notExists", "textContains", "attrEquals", "countAtLeast"]),
  selector: z.string().min(1).max(300),
  text: z.string().max(500).optional(),
  attr: z.string().max(100).optional(),
  value: z.string().max(500).optional(),
  count: z.number().int().positive().optional(),
});
export type FrontendAssertion = z.infer<typeof frontendAssertionSchema>;

export const frontendInteractionSchema = z.object({
  label: z.string().min(1).max(200),
  action: z.enum(["click", "hover", "fill"]),
  selector: z.string().min(1).max(300),
  text: z.string().max(500).optional(),
  assertType: z.enum(["exists", "textContains", "attrEquals"]),
  assertSelector: z.string().min(1).max(300),
  assertText: z.string().max(500).optional(),
  assertAttr: z.string().max(100).optional(),
  assertValue: z.string().max(500).optional(),
});
export type FrontendInteraction = z.infer<typeof frontendInteractionSchema>;

/**
 * Frontend UI replication challenge (spec 5.1): graded by visual diff against
 * a headless render of the recruiter's reference HTML/CSS, plus DOM assertions
 * and scripted interactions, never stdout matching, never pixels alone.
 */
export const frontendConfigSchema = z.object({
  starter: z
    .object({
      html: z.string().max(100_000).default(""),
      css: z.string().max(100_000).default(""),
      js: z.string().max(100_000).default(""),
    })
    .default({ html: "", css: "", js: "" }),
  /** Recruiter-only; rendered to reference screenshots, never sent to candidates. */
  referenceHtml: z.string().max(200_000).default(""),
  referenceCss: z.string().max(200_000).default(""),
  breakpoints: z.array(z.number().int().min(320).max(1920)).min(1).max(3).default([1280, 375]),
  /** width -> object-storage key; server-managed by the render job. */
  referenceScreenshots: z.record(z.string()).default({}),
  assertions: z.array(frontendAssertionSchema).max(30).default([]),
  interactions: z.array(frontendInteractionSchema).max(15).default([]),
  visualWeightPct: z.number().min(0).max(100).default(50),
  assertionsWeightPct: z.number().min(0).max(100).default(30),
  interactionsWeightPct: z.number().min(0).max(100).default(20),
});
export type FrontendConfig = z.infer<typeof frontendConfigSchema>;

export const httpTestSchema = z.object({
  name: z.string().min(1).max(200),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(1).max(500),
  /** Raw JSON request body */
  body: z.string().max(20_000).optional(),
  headers: z.record(z.string()).default({}),
  expectStatus: z.number().int().min(100).max(599).optional(),
  expectBodyContains: z.string().max(1000).optional(),
  /** Dot path into the JSON response, compared as a string (arrays support "length"). */
  expectJsonPath: z.string().max(300).optional(),
  expectJsonValue: z.string().max(1000).optional(),
  isHidden: z.boolean().default(true),
  weight: z.number().positive().max(100).default(1),
});
export type HttpTest = z.infer<typeof httpTestSchema>;

/**
 * API/backend challenge (spec 5.2): candidate writes a dependency-free Node
 * HTTP server; a harness inside the isolated grading network runs a scripted
 * request sequence and reports per-assertion results.
 */
export const apiChallengeConfigSchema = z.object({
  starterCode: z.string().max(200_000).default(""),
  port: z.number().int().min(1024).max(65535).default(3000),
  httpTests: z.array(httpTestSchema).min(1).max(50),
});
export type ApiChallengeConfig = z.infer<typeof apiChallengeConfigSchema>;

/**
 * Bug-fix challenge (spec type 4): a broken multi-file mini-project; the
 * hidden node:test suite must go from failing to passing.
 */
export const bugFixConfigSchema = z.object({
  /** Candidate-editable starter files, keyed by relative path. */
  files: z.record(z.string().max(100_000)),
  /** Visible tests the candidate can run on demand. */
  sampleTests: z.record(z.string().max(100_000)).default({}),
  /** Hidden grading suite (node:test files, e.g. "test/x.test.js"). */
  hiddenTests: z.record(z.string().max(100_000)).default({}),
});
export type BugFixConfig = z.infer<typeof bugFixConfigSchema>;

/** Repo-submission challenge (spec 5.3): clone -> install -> build -> test. */
export const repoConfigSchema = z.object({
  setupCommand: z
    .string()
    .max(500)
    .default("npm ci --no-audit --no-fund || npm install --no-audit --no-fund"),
  buildCommand: z.string().max(500).default(""),
  testCommand: z.string().max(500).default(""),
  buildWeightPct: z.number().min(0).max(100).default(40),
  testWeightPct: z.number().min(0).max(100).default(60),
  /** Optional: start the app and screenshot these routes for reviewers. */
  previewCommand: z.string().max(500).default(""),
  previewPort: z.number().int().min(1024).max(65535).optional(),
  previewRoutes: z.array(z.string().max(300)).max(5).default(["/"]),
});
export type RepoConfig = z.infer<typeof repoConfigSchema>;

export const REPO_URL_PATTERN =
  /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/;

/** Weighted rubric attached to any question (Section 3.2). Weights sum to 100. */
export const rubricSchema = z
  .object({
    components: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          weightPct: z.number().min(0).max(100),
          /** automated = derived from test cases; manual = reviewer slider */
          kind: z.enum(["automated", "manual"]),
        })
      )
      .min(1),
  })
  .refine(
    (r) => Math.abs(r.components.reduce((s, c) => s + c.weightPct, 0) - 100) < 0.001,
    { message: "rubric component weights must sum to 100" }
  );
export type Rubric = z.infer<typeof rubricSchema>;

// ---------------------------------------------------------------------------
// Test settings (stored in Test.settings JSONB)
// ---------------------------------------------------------------------------

export const testSettingsSchema = z.object({
  shuffleQuestions: z.boolean().default(false),
  /** Coding questions: score = weight-passed / weight-total. Off = all-or-nothing. */
  partialCredit: z.boolean().default(true),
  /** MSQ partial credit (correct-selected minus wrong-selected, floored at 0). */
  msqPartialCredit: z.boolean().default(false),
  /** Global language allowlist applied on top of per-question lists. Empty = all. */
  allowedLanguages: z.array(z.string()).default([]),
  /** Markdown shown on the instructions page before the timer starts. */
  instructionsMd: z.string().default(""),
  /** Minutes a candidate gets after first opening the link (caps at scheduling end). */
  perCandidateExpiryMinutes: z.number().int().positive().optional(),
  // Phase 2 proctoring knobs live here too so the config object is stable:
  maxTabSwitches: z.number().int().positive().optional(),
  maxFullscreenExits: z.number().int().positive().optional(),
  /** Requires CodeForge Sentinel (apps/sentinel) instead of the plain
   *  browser flow. candidate.routes.ts's /start rejects a session that
   *  never sent a Sentinel heartbeat when this is on. */
  requireSentinel: z.boolean().default(false),
});
export type TestSettings = z.infer<typeof testSettingsSchema>;

export const DEFAULT_TEST_SETTINGS: TestSettings = testSettingsSchema.parse({});

// ---------------------------------------------------------------------------
// Organization branding / white-labeling (Organization.brandingConfig).
// CodeForge is sold as a self-hosted, one-org-per-deployment product: each
// client's own instance is fully rebrandable across BOTH the candidate flow
// and the recruiter dashboard/login, not just the candidate-facing pages.
// ---------------------------------------------------------------------------

const hexColor = (label: string) =>
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, `${label} must be a 6-digit hex color like #4f46e5`)
    .optional();

export const brandingConfigSchema = z.object({
  /** Shown in place of the org's raw `name` wherever branding renders. */
  displayName: z.string().max(120).optional(),
  /** Short line under the name/logo, e.g. "Engineering Careers". */
  tagline: z.string().max(160).optional(),
  /** Primary logo, used on light backgrounds (candidate pages, login, sidebar). */
  logoUrl: z.string().url().max(500).optional(),
  /** Optional alternate logo for dark surfaces; falls back to logoUrl. */
  logoDarkUrl: z.string().url().max(500).optional(),
  /** Browser tab icon. Falls back to the CodeForge default when unset. */
  faviconUrl: z.string().url().max(500).optional(),
  accentColor: hexColor("accentColor"),
  /** Optional darker shade for hover states; auto-derived from accentColor if unset. */
  accentColorHover: hexColor("accentColorHover"),
  /** Shown to candidates who need help (identity mismatch, technical issues). */
  supportEmail: z.string().email().max(200).optional(),
  /** Link from candidate-facing pages, e.g. the org's own privacy policy. */
  privacyUrl: z.string().url().max(500).optional(),
  /**
   * White-label switch: when true, every "Powered by CodeForge" / bare
   * "CodeForge" wordmark fallback is suppressed across candidate pages, the
   * recruiter login page, and the dashboard sidebar. Off by default so a
   * fresh install still reads coherently before a client sets up branding.
   */
  hideCodeForgeBranding: z.boolean().default(false),
});
export type BrandingConfig = z.infer<typeof brandingConfigSchema>;

/** Public-safe subset served pre-auth (login page chrome, browser tab). */
export const publicBrandingSchema = brandingConfigSchema.pick({
  displayName: true,
  tagline: true,
  logoUrl: true,
  logoDarkUrl: true,
  faviconUrl: true,
  accentColor: true,
  accentColorHover: true,
  hideCodeForgeBranding: true,
});
export type PublicBranding = z.infer<typeof publicBrandingSchema>;

// ---------------------------------------------------------------------------
// Reviewer rubric scoring (Phase 4: ReviewNote.rubricScores, spec 3.7)
// ---------------------------------------------------------------------------

/** One manual slider score (1-5) keyed by the rubric component's `key`. */
export const rubricScoresSchema = z.record(z.number().min(1).max(5));
export type RubricScores = z.infer<typeof rubricScoresSchema>;

export const DEFAULT_MANUAL_RUBRIC: { key: string; label: string; weightPct: number }[] = [
  { key: "codeOrganization", label: "Code organization", weightPct: 34 },
  { key: "uiPolish", label: "UI polish", weightPct: 33 },
  { key: "completeness", label: "Completeness", weightPct: 33 },
];

// ---------------------------------------------------------------------------
// Scoring helpers (pure functions, used by API grading + shown in web UI docs)
// ---------------------------------------------------------------------------

export interface McqScoreInput {
  config: McqConfig;
  selectedOptionIds: string[];
  points: number;
  msqPartialCredit: boolean;
}

/** Deterministic MCQ/MSQ scoring. Returns a score in [-points, points]. */
export function scoreMcq({ config, selectedOptionIds, points, msqPartialCredit }: McqScoreInput): number {
  const selected = new Set(selectedOptionIds);
  const correct = new Set(config.correctOptionIds);
  if (selected.size === 0) return 0; // unanswered is never penalized

  const exactMatch =
    selected.size === correct.size && [...selected].every((id) => correct.has(id));

  if (exactMatch) return points;

  if (config.multiple && msqPartialCredit) {
    let correctSelected = 0;
    let wrongSelected = 0;
    for (const id of selected) (correct.has(id) ? correctSelected++ : wrongSelected++);
    const frac = Math.max(0, (correctSelected - wrongSelected) / correct.size);
    return round2(points * frac);
  }

  return config.negativeMarkingPct > 0 ? round2(-points * config.negativeMarkingPct) : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Judge verdicts (mapped from Judge0 status ids)
// ---------------------------------------------------------------------------

export const VERDICTS = [
  "pending",
  "accepted",
  "wrong_answer",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "compile_error",
  "runtime_error",
  "internal_error",
] as const;
export type Verdict = (typeof VERDICTS)[number];

// ---------------------------------------------------------------------------
// Candidate-facing sanitized DTOs (what the test-taking UI receives; note the
// absence of hidden test cases and correct answers)
// ---------------------------------------------------------------------------

export interface CandidateSampleCase {
  input: string;
  expectedOutput: string;
}

export interface CandidateQuestion {
  questionId: string;
  order: number;
  points: number;
  type: QuestionType;
  title: string;
  bodyMd: string;
  /** dsa only */
  languages?: string[];
  starterCode?: Record<string, string>;
  timeLimitMs?: number;
  memoryLimitKb?: number;
  sampleCases?: CandidateSampleCase[];
  /** mcq only */
  options?: { id: string; textMd: string; imageUrl?: string }[];
  multiple?: boolean;
  hasNegativeMarking?: boolean;
  /** frontend_ui only */
  starter?: { html: string; css: string; js: string };
  breakpoints?: number[];
  /** width -> short-lived presigned image URL of the reference design */
  referenceImageUrls?: Record<string, string>;
  /** api_challenge only */
  apiStarterCode?: string;
  apiPort?: number;
  sampleHttpTests?: { name: string; method: string; path: string; expectStatus?: number }[];
  /** bug_fix only */
  files?: Record<string, string>;
  sampleTestNames?: string[];
}

export interface CandidateRunCaseResult {
  input: string;
  expectedOutput: string;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  verdict: Verdict;
  passed: boolean;
  timeMs: number | null;
  memoryKb: number | null;
}
