import { test, expect } from "@playwright/test";

/**
 * TASK-080 auth setup — ONE-TIME interactive.
 *
 * The founder completes the Clerk sign-in BY HAND in the headed browser
 * (credentials never leave their keyboard), then MUST also connect at
 * least one platform (Settings & Accounts → Connect) so the composer flow
 * has a ship target. Playwright waits for both signals and saves the
 * session to .auth/state.json for all member flows.
 *
 * If the storage file already exists, the setup still runs but skips the
 * waits early (re-runs are cheap and idempotent).
 */

test("founder signs in and connects a platform", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle").catch(() => {});

  // Likely already signed in from a previous attempt: skip if we land in
  // the app shell directly.
  if (!page.url().includes("sign-in")) {
    await ensureConnected(page);
  } else {
    // Manual sign-in: the founder fills the Clerk form themselves.
    await page.waitForURL("**/compose**", {
      timeout: 300_000,
    }).catch(async () => {
      // Some flows land on history/settings first — treat any (app) page
      // as signed-in.
      if (!/(compose|history|settings)/.test(page.url())) {
        throw new Error(
          "Sign-in did not land in the app. Complete the Clerk form and continue.",
        );
      }
    });
    await ensureConnected(page);
  }

  // Persist the session for all member flows.
  await page.context().storageState({
    path: "tests/e2e/.auth/state.json",
  });
});

/**
 * Waits for the founder to connect a platform. Registration is
 * founder-driven; we only poll for the signal (reconnect chips excluded).
 */
async function ensureConnected(page: import("@playwright/test").Page) {
  await page.goto("/settings/accounts");
  const alreadyHasChip = await page
    .locator("[data-testid^='platform-chip-'], [aria-label^='Connected platforms']")
    .first()
    .isVisible()
    .catch(() => false);

  const connectButton = page.getByRole("link", { name: /connect/i }).or(
    page.getByRole("link", { name: /Connect platforms/i }),
  );
  const needsConnect = !(await page
    .locator("[data-testid^='reconnect'], [data-testid='connect-list'] li")
    .first()
    .isVisible()
    .catch(() => false));

  if (!alreadyHasChip || needsConnect) {
    // Signal a pause: any successful PFM consent in a NEW tab will land on
    // /settings/accounts?connected=N.
    await page.waitForURL("**/settings/accounts?connected=*", {
      timeout: 300_000,
    });
  }

  // Final assertion: at least one platform row is connected.
  await expect(
    page.getByRole("list", { name: /Connected platforms/i }),
  ).toBeVisible();
}
