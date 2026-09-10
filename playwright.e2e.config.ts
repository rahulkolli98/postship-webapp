import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config — TASK-080 (PRD verification flows).
 *
 * Targets the DEPLOYED staging site (full stack: Cloudflare + Convex +
 * Clerk + OpenRouter + PFM + Paddle sandbox). NOT the local dev server.
 *
 * Auth: `tests/e2e/auth.setup.ts` is a setup project — it opens the
 * staging sign-in page HEADED once; the founder completes the Clerk
 * sign-in by hand (credentials never leave their keyboard) and the
 * session saves to .auth/state.json (gitignored). Member projects reuse
 * it headlessly.
 *
 * Run:
 *   npx playwright test --config=playwright.e2e.config.ts tests/e2e/auth.setup.ts --headed   (once)
 *   npx playwright test --config=playwright.e2e.config.ts                                    (all flows)
 */

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://postship-webapp.rahulkolli0905.workers.dev",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        headless: false, // founder completes the sign-in by hand
        storageState: undefined,
      },
    },
    {
      name: "e2e",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        storageState: "tests/e2e/.auth/state.json",
      },
    },
  ],
});
