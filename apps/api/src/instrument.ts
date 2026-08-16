/**
 * Must be the FIRST import in index.ts/worker.ts, before anything else —
 * Sentry's own docs requirement, so it can instrument modules as they load.
 *
 * A no-op until SENTRY_DSN is set (config.ts: optional, unvalidated format —
 * this file is the only thing that ever reads it). Nothing about startup,
 * request handling, or the job queues depends on this file having done
 * anything; there's no error-tracking account this agent can create for
 * you, only the wiring so adding a real DSN turns it on immediately.
 */
import * as Sentry from "@sentry/node";
import { config } from "./config";

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.env,
    // Full error capture regardless; trace sampling only in prod and even
    // then a small fraction — traces are for performance investigation, not
    // needed at dev volume and not needed on every request in prod either.
    tracesSampleRate: config.isProd ? 0.1 : 0,
  });
}
