import { defineConfig } from "vitest/config";

// Plain `vitest run` (the `test` script) is pure unit tests only — no DB, no
// Redis, safe to run against a developer's real local .env without touching
// anything. *.integration.test.ts files hit a real Postgres and are only
// run explicitly via `test:integration`, which points DATABASE_URL at a
// disposable test database instead (see package.json + CI).
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
