/**
 * Must be the FIRST import in index.ts, before anything else — Sentry's own
 * docs requirement, so it can instrument modules as they load.
 *
 * A no-op until SENTRY_DSN is set (config.ts: optional, unvalidated format —
 * this file is the only thing that ever reads it). Mirrors
 * apps/api/src/instrument.ts.
 */
import * as Sentry from "@sentry/node";
import { config } from "./config";

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.env,
    tracesSampleRate: config.isProd ? 0.1 : 0,
  });
}
