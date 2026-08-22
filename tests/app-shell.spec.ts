import { test, expect } from "@playwright/test";

/**
 * TASK-022 app shell — protection contract.
 *
 * The authenticated visual shell is verified manually (needs a real Clerk
 * session). Here we prove the proxy gate: signed-out visitors hitting any
 * (app) route get bounced to sign-in, while public routes stay open.
 */

test("signed-out /compose redirects to sign-in", async ({ request }) => {
  const res = await request.get("/compose");
  expect(res.url()).toContain("/sign-in");
});

test("signed-out /history redirects to sign-in", async ({ request }) => {
  const res = await request.get("/history");
  expect(res.url()).toContain("/sign-in");
});

test("signed-out /settings/accounts redirects to sign-in", async ({ request }) => {
  const res = await request.get("/settings/accounts");
  expect(res.url()).toContain("/sign-in");
});

test("webhook endpoint stays public despite protection", async ({ request }) => {
  // Public per clerk-webhooks skill: no auth redirect, straight into the
  // handler (which rejects us on missing svix headers -> 400).
  const res = await request.post("/api/webhooks/clerk", { data: {} });
  expect(res.status()).toBe(400);
  expect(res.url()).not.toContain("/sign-in");
});
