import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts's default (unit-only) run: only
// *.integration.test.ts files, invoked via `npm run test:integration` with
// DATABASE_URL pointed at a disposable test database (see package.json's
// dotenv -e .env.test wrapper, and .env.test.example for the template).
export default defineConfig({
  test: {
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
