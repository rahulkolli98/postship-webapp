import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — webapp.
 *
 * Lives inside `./webapp/` so the test infra (config, tests/, screenshots/)
 * stays scoped to this app (per-app Playwright rule, docs/AGENTS.md #3).
 * Run from inside this folder:
 *
 *   cd webapp
 *   npx playwright test              # run everything
 *   npx playwright test --ui         # debug mode
 *   npx playwright test --headed     # visible browser
 *
 * The webServer block below auto-starts `npm run dev` on port 3001
 * (landing owns 3000, so both apps can run side by side).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Tests exercise the webhook's rejection paths. The dummy secret makes
    // svix verification run (and fail) rather than short-circuiting on the
    // missing-secret guard — production never sets this fake value.
    env: {
      CLERK_WEBHOOK_SECRET: "whsec_test_dummy_secret_for_rejection_paths",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
