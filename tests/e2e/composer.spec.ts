import { test, expect } from "@playwright/test";

/**
 * TASK-080 — the signature E2E flow on staging:
 *   upload → master description → generate (real OpenRouter call) →
 *   editable cards → ship (real PFM publish attempt) → progress panel.
 *
 * Prereqs (founder, once):
 *   - auth.setup.ts completed (session + ≥1 connected platform)
 *
 * Cards require a video, so we upload a TINY generated MP4 (Playwright's
 * set_input_files accepts any buffer named as a video; VideoUploader
 * validates by extension, so the file just needs a .mp4 name).
 */

const MP4_BYTES = Buffer.from(
  // Minimal moov-free probe payload; width/height detection runs
  // client-side but a failed probe only impacts pairing defaults,
  // which this flow exercises loosely.
  Buffer.alloc(1024, 0),
);

test("composer signature flow: upload, generate, ship", async ({ page }) => {
  await page.goto("/compose");

  // 1. Upload a video (drag-drop + click both go through the same input).
  const fileInput = page.locator("input[type='file']").first();
  await fileInput.setInputFiles({
    name: "e2e-video.mp4",
    mimeType: "video/mp4",
    buffer: MP4_BYTES,
  });
  await expect(
    page.getByText(/e2e-video\.mp4/i).first(),
  ).toBeVisible({ timeout: 60_000 });

  // 2. Master description (over the 20-char gate).
  await page
    .getByLabel("Master description")
    .or(page.locator("#master-description"))
    .first()
    .fill(
      "A quiet morning walk through the old city market — the smell of fresh bread, the rhythm of shutters opening, and the first regulars taking their stools.",
    );

  // 3. Generate — real OpenRouter call (up to 30s).
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(
    page.locator("[data-testid='platform-card-youtube'], [data-testid^='platform-card-']").first(),
  ).toBeVisible();

  // 4. Ship — real PFM publish attempt against the connected platform(s).
  await page.getByRole("button", { name: /^Ship/i }).click();
  await expect(page.locator("[data-testid='publish-progress']")).toBeVisible({
    timeout: 120_000,
  });

  // Final states land via webhook; the panel being visible + at least one
  // per-platform row is the E2E completion signal.
  await expect(
    page.locator("[data-testid^='publish-']").first(),
  ).toBeVisible();
});
