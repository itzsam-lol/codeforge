import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Loads the same repo-root .env as apps/api; HQ's variables just live
// alongside the product's under an HQ_ prefix, no separate .env file needed.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// A blank `KEY=` line in .env parses as "" (empty string), not unset — every
// optional var in .env.example is documented as "leave blank to disable",
// so an email/url-refined optional field must treat "" the same as unset
// rather than failing validation on it.
const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HQ_API_PORT: z.coerce.number().default(4100),
  HQ_WEB_ORIGIN: z.string().url().default("http://localhost:3100"),
  HQ_DATABASE_URL: z.string().min(1),
  HQ_JWT_ACCESS_SECRET: z.string().min(32),
  HQ_JWT_REFRESH_SECRET: z.string().min(32),
  HQ_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(15),
  HQ_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  // Shared secret the marketing site's /api/contact route presents when
  // dual-writing a lead; unrelated to staff auth (marketing has no session).
  HQ_INGEST_SECRET: z.string().min(16),
  // Separate shared secret for the support-ticket sync (routes/support.routes.ts):
  // each client deployment's own apps/api sets the same value under its own
  // HQ_SUPPORT_INGEST_SECRET, used both to authenticate its incoming ticket
  // writes and to validate HQ's reply-back calls. Kept distinct from
  // HQ_INGEST_SECRET so the two integrations don't share a blast radius.
  HQ_SUPPORT_INGEST_SECRET: z.string().min(16).optional(),
  // Same posture as HQ_SUPPORT_INGEST_SECRET, distinct value: a client
  // deployment's apps/api presents this to read that client's own billing
  // summary (routes/billing.routes.ts) — read-only, service-to-service, kept
  // separate so a leak of one doesn't expose the other's surface.
  HQ_BILLING_SECRET: z.string().min(16).optional(),
  // AES-256-GCM key (32 raw bytes, hex-encoded = 64 chars) for encrypting
  // provisioning SSH private keys at rest.
  HQ_SSH_KEY_ENCRYPTION_SECRET: z.string().length(64),
  // Same shape, separate key: encrypts HqStaff.twoFactorSecret at rest.
  HQ_TOTP_ENCRYPTION_SECRET: z.string().length(64),
  HQ_SEED_OWNER_NAME: z.string().default("CodeForge Owner"),
  HQ_SEED_OWNER_EMAIL: z.string().email().default("owner@codeforge.local"),
  HQ_SEED_OWNER_PASSWORD: z.string().min(8).default("hqowner1234!"),
  // Deployment-down/up alerts (services/healthMonitor.ts). Both channels are
  // optional and independent; unset = that channel is skipped, same
  // graceful-degradation pattern as apps/api/src/lib/email.ts.
  HQ_EMAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
  HQ_RESEND_API_KEY: z.string().optional().default(""),
  HQ_EMAIL_FROM: z.string().default("CodeForge HQ <alerts@codeforge.local>"),
  HQ_ALERT_EMAIL: optionalString(z.string().email()),
  HQ_ALERT_SLACK_WEBHOOK_URL: optionalString(z.string().url()),
  // Optional: unset = error tracking is a no-op (instrument.ts checks this
  // before calling Sentry.init at all). Its own HQ_-prefixed var, not
  // apps/api's SENTRY_DSN — both read the same repo-root .env, and HQ's
  // internal errors (CodeForge's own ops tool) belong in a separate Sentry
  // project from any one client deployment's apps/api errors.
  HQ_SENTRY_DSN: z.string().optional(),

  // --- CodeForge Arena contest sync (unprefixed: shared with apps/api,
  // which reads this same repo-root .env — see apps/api/src/config.ts's
  // matching ARENA_SYNC_SECRET/ARENA_API_URL for the other leg). ---
  ARENA_API_URL: z.string().url().default("http://localhost:4000"),
  ARENA_SYNC_SECRET: z.string().min(16),

  // --- Google Cloud AI (Gemini for the HQ question generator) — plain API
  // key, not a service-account key/ADC (see apps/api's matching config
  // comment for why). Optional, same graceful-no-op posture elsewhere. ---
  GOOGLE_AI_API_KEY: optionalString(z.string()),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid HQ environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  isProd: parsed.data.NODE_ENV === "production",
  port: parsed.data.HQ_API_PORT,
  webOrigin: parsed.data.HQ_WEB_ORIGIN,
  databaseUrl: parsed.data.HQ_DATABASE_URL,
  jwtAccessSecret: parsed.data.HQ_JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.HQ_JWT_REFRESH_SECRET,
  accessTokenTtlMinutes: parsed.data.HQ_ACCESS_TOKEN_TTL_MINUTES,
  refreshTokenTtlDays: parsed.data.HQ_REFRESH_TOKEN_TTL_DAYS,
  ingestSecret: parsed.data.HQ_INGEST_SECRET,
  supportIngestSecret: parsed.data.HQ_SUPPORT_INGEST_SECRET,
  billingSecret: parsed.data.HQ_BILLING_SECRET,
  sshKeyEncryptionSecret: parsed.data.HQ_SSH_KEY_ENCRYPTION_SECRET,
  totpEncryptionSecret: parsed.data.HQ_TOTP_ENCRYPTION_SECRET,
  seed: {
    ownerName: parsed.data.HQ_SEED_OWNER_NAME,
    ownerEmail: parsed.data.HQ_SEED_OWNER_EMAIL,
    ownerPassword: parsed.data.HQ_SEED_OWNER_PASSWORD,
  },
  emailDriver: parsed.data.HQ_EMAIL_DRIVER,
  resendApiKey: parsed.data.HQ_RESEND_API_KEY,
  emailFrom: parsed.data.HQ_EMAIL_FROM,
  alertEmail: parsed.data.HQ_ALERT_EMAIL,
  alertSlackWebhookUrl: parsed.data.HQ_ALERT_SLACK_WEBHOOK_URL,
  sentryDsn: parsed.data.HQ_SENTRY_DSN,
  arenaApiUrl: parsed.data.ARENA_API_URL.replace(/\/$/, ""),
  arenaSyncSecret: parsed.data.ARENA_SYNC_SECRET,
  googleAiApiKey: parsed.data.GOOGLE_AI_API_KEY,
};
