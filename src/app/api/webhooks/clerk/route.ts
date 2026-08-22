import { NextResponse } from "next/server";
import { Webhook, type WebhookRequiredHeaders } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";

/**
 * Clerk webhook receiver — TASK-018 (PRD § 4, § 9).
 *
 * Flow:
 *   1. Clerk POSTs a signed event to /api/webhooks/clerk.
 *   2. We verify the svix signature against CLERK_WEBHOOK_SECRET
 *      (Clerk Dashboard → Webhooks → Signing Secret). Fail closed when the
 *      secret is missing — an unverified webhook must never touch Convex.
 *   3. On `user.created` (and `user.updated`, same idempotent path), we call
 *      the Convex `users.upsertFromClerk` mutation, which dedupes by
 *      clerkUserId and starts the trial clock for new records.
 *
 * This route is intentionally public (PRD: `/api/webhooks/*` bypasses auth);
 * the svix signature IS the authentication.
 *
 * Local verification without a public tunnel is limited to negative tests
 * (missing/garbage signature → 400). The positive path fires once the app
 * is claimed (`npx clerk auth login`) and the webhook endpoint is registered
 * in the Clerk Dashboard pointing at this URL.
 */

// Module-scope singleton, same pattern as landing's /api/waitlist route.
const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210",
);

type ClerkUserEventData = {
  id: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
};

function extractUserFields(data: ClerkUserEventData) {
  const primary =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id) ??
    data.email_addresses?.[0];

  const displayName =
    [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
    data.username ||
    undefined;

  return {
    clerkUserId: data.id,
    email: primary?.email_address ?? "",
    displayName,
    avatarUrl: data.image_url ?? undefined,
  };
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never process unsigned webhooks. Same philosophy as the
    // Turnstile check in landing's waitlist route.
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { ok: false, error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const headers: WebhookRequiredHeaders = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  if (!headers["svix-id"] || !headers["svix-timestamp"] || !headers["svix-signature"]) {
    return NextResponse.json(
      { ok: false, error: "Missing svix headers" },
      { status: 400 },
    );
  }

  let payload: string;
  try {
    payload = await request.text();
  } catch {
    return NextResponse.json({ ok: false, error: "Unreadable body" }, { status: 400 });
  }

  let event: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, headers) as WebhookEvent;
  } catch {
    // Bad signature — do not leak verification details to the caller.
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "user.created" && event.type !== "user.updated") {
    // Acknowledge unhandled event types so Clerk doesn't retry them forever.
    return NextResponse.json({ ok: true, handled: false, type: event.type });
  }

  try {
    const fields = extractUserFields(event.data as ClerkUserEventData);
    if (!fields.clerkUserId || !fields.email) {
      return NextResponse.json(
        { ok: false, error: "Event payload missing user identity" },
        { status: 400 },
      );
    }

    const userId = await convex.mutation(api.users.upsertFromClerk, fields);
    return NextResponse.json({ ok: true, handled: true, userId });
  } catch (err) {
    // Log full detail server-side; return a generic body (no internals leak).
    console.error("[clerk-webhook] Convex mutation failed:", err);
    return NextResponse.json(
      { ok: false, error: "Processing failed" },
      { status: 502 },
    );
  }
}
