import { test, expect } from "@playwright/test";

/**
 * TASK-018 webhook contract — negative paths.
 *
 * The positive path (signed Clerk event → Convex row) needs a claimed app
 * with a registered webhook endpoint, so it's a manual/founder step for now.
 * Here we assert the route's guard rails: unsigned requests and garbage
 * signatures never reach Convex.
 */

const WEBHOOK_URL = "/api/webhooks/clerk";

test("webhook rejects request with missing svix headers", async ({ request }) => {
  const res = await request.post(WEBHOOK_URL, {
    data: { type: "user.created", data: { id: "user_x" } },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.ok).toBe(false);
});

test("webhook rejects invalid signature", async ({ request }) => {
  const res = await request.post(WEBHOOK_URL, {
    headers: {
      "svix-id": "msg_fake",
      "svix-timestamp": new Date().toISOString(),
      "svix-signature": "v1,garbage_signature_value",
    },
    data: { type: "user.created", data: { id: "user_x" } },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.ok).toBe(false);
});

test("Post for Me webhook rejects a missing event type", async ({ request }) => {
  const res = await request.post("/api/webhooks/postforme", {
    headers: { "Post-For-Me-Webhook-Secret": "wrong" },
    data: { data: {} },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.ok).toBe(false);
});

test("Post for Me webhook rejects an incorrect secret", async ({ request }) => {
  const res = await request.post("/api/webhooks/postforme", {
    headers: { "Post-For-Me-Webhook-Secret": "wrong" },
    data: { event_type: "social.post.updated", data: {} },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.ok).toBe(false);
});
