import { test, expect } from "@playwright/test";

/**
 * TASK-016b scaffold smoke — the webapp boots clean.
 *
 * Mirrors landing's TASK-001 verification: HTTP 200, visible h1, and no
 * page errors on load. Deeper tests (auth shell, composer) arrive with
 * Phase 1 tasks.
 */
test("webapp boots: 200 + h1 + clean console", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  await expect(page.locator("h1")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
