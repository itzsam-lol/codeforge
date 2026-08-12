import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load the repo-root .env regardless of whether we run from src (tsx) or dist.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
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
  HQ_API_URL: z.string().url().optional(),
  HQ_SUPPORT_INGEST_SECRET: z.string().optional(),
  // Which HQ Client this single-tenant deployment belongs to (set by
  // provisioning's env template — see apps/hq-api/src/services/provisioning.ts).
  HQ_CLIENT_ID: z.string().optional(),
  // Exactly 32 raw bytes, hex-encoded (64 chars). Encrypts TOTP secrets at
  // rest (User.twoFactorSecret) — see lib/crypto.ts, mirrors HQ's
  // HQ_SSH_KEY_ENCRYPTION_SECRET pattern.
  TOTP_ENCRYPTION_SECRET: z.string().length(64),
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
  webOrigin: parsed.data.WEB_ORIGIN,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  accessTokenTtlMinutes: parsed.data.ACCESS_TOKEN_TTL_MINUTES,
  refreshTokenTtlDays: parsed.data.REFRESH_TOKEN_TTL_DAYS,
  judge0Url: parsed.data.JUDGE0_URL.replace(/\/$/, ""),
  judge0AuthToken: parsed.data.JUDGE0_AUTH_TOKEN,
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
  totpEncryptionSecret: parsed.data.TOTP_ENCRYPTION_SECRET,
};
