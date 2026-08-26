import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load the repo-root .env regardless of whether we run from src (tsx) or dist.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// A blank `KEY=` line in .env parses as "" (empty string), not unset — every
// optional var in .env.example is documented as "leave blank to disable",
// so a url/email-refined optional field must treat "" the same as unset
// rather than failing validation on it.
const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  // This API's own public origin — used to build absolute links back to
  // itself (e.g. the Sentinel installer download link in the onboarding
  // email, routes/downloads.routes.ts) where a relative path won't do.
  API_ORIGIN: z.string().url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  // Extra origins the API accepts CORS requests from, beyond WEB_ORIGIN
  // (e.g. a separate HQ or marketing origin in production). Comma-separated;
  // same convention as GRADING_EGRESS_ALLOWLIST below. WEB_ORIGIN is always
  // implicitly allowed regardless of this value.
  ALLOWED_ORIGINS: z.string().default(""),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  // 32 bytes minimum: short enough to type in dev, long enough that brute-forcing
  // the HMAC signing key isn't practical (see .env.example for generating one).
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  JUDGE0_URL: z.string().url().default("http://localhost:2358"),
  JUDGE0_AUTH_TOKEN: z.string().optional().default(""),
  JUDGE0_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  // judge0 = production (isolate sandbox); docker = local-dev fallback for
  // hosts whose kernel lacks cgroup v1 (e.g. WSL2 kernel 6.12+).
  EXECUTOR: z.enum(["judge0", "docker"]).default("judge0"),
  // console = logs the message (dev default). resend = real delivery via the
  // Resend HTTP API (https://resend.com), no SDK dependency, gated on RESEND_API_KEY.
  EMAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().default("CodeForge <no-reply@codeforge.local>"),
  RESEND_API_KEY: z.string().optional().default(""),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_ACCESS_KEY: z.string().default("codeforge"),
  S3_SECRET_KEY: z.string().default("codeforge-secret"),
  S3_BUCKET: z.string().default("codeforge"),
  // Days to keep webcam/identity snapshots before the retention sweep deletes
  // the image (the proctoring-timeline entry itself is kept, image-less).
  // 0 disables the sweep (keep forever).
  SNAPSHOT_RETENTION_DAYS: z.coerce.number().int().min(0).default(90),
  // Hosts the repo-grading pool's egress proxy will tunnel to (git hosts +
  // npm registry); everything else gets a 403 at the proxy. Comma-separated;
  // a bare "example.com" also matches subdomains.
  GRADING_EGRESS_ALLOWLIST: z
    .string()
    .default(
      "github.com,codeload.github.com,objects.githubusercontent.com,raw.githubusercontent.com,api.github.com,gitlab.com,bitbucket.org,registry.npmjs.org,registry.yarnpkg.com"
    ),
  WORKER_INLINE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  SEED_ORG_NAME: z.string().default("CodeForge Demo Org"),
  SEED_ADMIN_EMAIL: z.string().email().default("admin@codeforge.local"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("admin1234!"),
  // Dual-write target for codeforge-channel support tickets — same
  // optional, best-effort pattern as marketing's lead ingest into HQ
  // (HQ_API_URL + a shared secret header). Both unset = codeforge-channel
  // tickets still work locally, they just never sync to HQ's inbox.
  HQ_API_URL: optionalString(z.string().url()),
  HQ_SUPPORT_INGEST_SECRET: z.string().optional(),
  // Which HQ Client this single-tenant deployment belongs to (set by
  // provisioning's env template — see apps/hq-api/src/services/provisioning.ts).
  HQ_CLIENT_ID: z.string().optional(),
  // Read-only counterpart to HQ_SUPPORT_INGEST_SECRET: lets this deployment
  // fetch its own billing summary from HQ (routes/billing.routes.ts). Unset
  // = the billing page tells staff it isn't available rather than erroring.
  HQ_BILLING_SECRET: z.string().optional(),
  // Exactly 32 raw bytes, hex-encoded (64 chars). Encrypts TOTP secrets at
  // rest (User.twoFactorSecret) — see lib/crypto.ts, mirrors HQ's
  // HQ_SSH_KEY_ENCRYPTION_SECRET pattern.
  TOTP_ENCRYPTION_SECRET: z.string().length(64),
  // Optional: unset = error tracking is a no-op (instrument.ts checks this
  // before calling Sentry.init at all), not a startup requirement. Get one
  // from sentry.io (free tier is fine to start) or a self-hosted instance.
  SENTRY_DSN: z.string().optional(),

  // --- CodeForge Arena (public competitive-coding product) ---
  ARENA_JWT_ACCESS_SECRET: z.string().min(32),
  ARENA_JWT_REFRESH_SECRET: z.string().min(32),
  // Shared secret for the HQ(contest authoring) <-> apps/api(runtime)
  // contest push, both directions — see routes/arenaContestSync.routes.ts.
  ARENA_SYNC_SECRET: z.string().min(16),
  ARENA_HQ_API_URL: z.string().url().default("http://localhost:4100"),
  ARENA_MARKETING_ORIGIN: z.string().url().default("http://localhost:3200"),
  ARENA_GOOGLE_CLIENT_ID: optionalString(z.string()),
  ARENA_GOOGLE_CLIENT_SECRET: optionalString(z.string()),
  ARENA_GITHUB_CLIENT_ID: optionalString(z.string()),
  ARENA_GITHUB_CLIENT_SECRET: optionalString(z.string()),

  // --- Google Cloud AI (Gemini for practice hints, Cloud Vision for
  // proctoring-snapshot analysis). A single plain API key authenticates
  // both — deliberately not a service-account key/ADC: many GCP orgs
  // (particularly credit-program-provisioned projects) enforce the
  // iam.disableServiceAccountKeyCreation org policy, which blocks minting
  // service-account keys entirely but has no effect on API keys. Optional:
  // absence means every AI feature no-ops gracefully rather than erroring
  // (same posture as SENTRY_DSN elsewhere in this file). ---
  GOOGLE_AI_API_KEY: optionalString(z.string()),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  isProd: parsed.data.NODE_ENV === "production",
  port: parsed.data.API_PORT,
  apiOrigin: parsed.data.API_ORIGIN.replace(/\/$/, ""),
  webOrigin: parsed.data.WEB_ORIGIN,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  accessTokenTtlMinutes: parsed.data.ACCESS_TOKEN_TTL_MINUTES,
  refreshTokenTtlDays: parsed.data.REFRESH_TOKEN_TTL_DAYS,
  judge0Url: parsed.data.JUDGE0_URL.replace(/\/$/, ""),
  judge0AuthToken: parsed.data.JUDGE0_AUTH_TOKEN,
  judge0PollTimeoutMs: parsed.data.JUDGE0_POLL_TIMEOUT_MS,
  executor: parsed.data.EXECUTOR,
  emailDriver: parsed.data.EMAIL_DRIVER,
  emailFrom: parsed.data.EMAIL_FROM,
  resendApiKey: parsed.data.RESEND_API_KEY,
  s3: {
    endpoint: parsed.data.S3_ENDPOINT,
    accessKey: parsed.data.S3_ACCESS_KEY,
    secretKey: parsed.data.S3_SECRET_KEY,
    bucket: parsed.data.S3_BUCKET,
  },
  snapshotRetentionDays: parsed.data.SNAPSHOT_RETENTION_DAYS,
  gradingEgressAllowlist: parsed.data.GRADING_EGRESS_ALLOWLIST,
  workerInline: parsed.data.WORKER_INLINE,
  seed: {
    orgName: parsed.data.SEED_ORG_NAME,
    adminEmail: parsed.data.SEED_ADMIN_EMAIL,
    adminPassword: parsed.data.SEED_ADMIN_PASSWORD,
  },
  hqApiUrl: parsed.data.HQ_API_URL,
  hqSupportIngestSecret: parsed.data.HQ_SUPPORT_INGEST_SECRET,
  hqClientId: parsed.data.HQ_CLIENT_ID,
  hqBillingSecret: parsed.data.HQ_BILLING_SECRET,
  totpEncryptionSecret: parsed.data.TOTP_ENCRYPTION_SECRET,
  sentryDsn: parsed.data.SENTRY_DSN,
  arenaJwtAccessSecret: parsed.data.ARENA_JWT_ACCESS_SECRET,
  arenaJwtRefreshSecret: parsed.data.ARENA_JWT_REFRESH_SECRET,
  arenaSyncSecret: parsed.data.ARENA_SYNC_SECRET,
  arenaHqApiUrl: parsed.data.ARENA_HQ_API_URL.replace(/\/$/, ""),
  arenaMarketingOrigin: parsed.data.ARENA_MARKETING_ORIGIN.replace(/\/$/, ""),
  arenaGoogleClientId: parsed.data.ARENA_GOOGLE_CLIENT_ID,
  arenaGoogleClientSecret: parsed.data.ARENA_GOOGLE_CLIENT_SECRET,
  arenaGithubClientId: parsed.data.ARENA_GITHUB_CLIENT_ID,
  arenaGithubClientSecret: parsed.data.ARENA_GITHUB_CLIENT_SECRET,
  googleAiApiKey: parsed.data.GOOGLE_AI_API_KEY,
};
