import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";

/**
 * Clerk webhook receiver — TASK-018 (PRD § 4, § 9).
 *
 * Flow:
 *   1. Clerk POSTs a signed event to /api/webhooks/clerk.
 *   2. `verifyWebhook(req)` validates the svix signature using the
 *      CLERK_WEBHOOK_SIGNING_SECRET env var (from the endpoint's Signing
 *      Secret in the Clerk Dashboard). It throws on bad/missing signatures,
 *      so an unverified webhook never touches Convex.
 *   3. On `user.created` / `user.updated` we call the Convex
 *      `users.upsertFromClerk` mutation, which dedupes by clerkUserId and
 *      starts the trial clock for new records. Other event types are
 *      acknowledged with 200 so Clerk doesn't retry them forever.
 *
 * This route is intentionally public (PRD: `/api/webhooks/*` bypasses auth);
 * the svix signature IS the authentication. Local dev testing uses Clerk's
 * first-party relay (`npx clerk webhooks listen --forward-to ...`) — no
 * third-party tunnel needed.
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

export async function POST(request: NextRequest) {
  let event: WebhookEvent;
  try {
    // Reads CLERK_WEBHOOK_SIGNING_SECRET from env; throws on any
    // verification failure (missing secret, bad headers, bad signature).
    event = await verifyWebhook(request);
  } catch (err) {
    if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
      console.error("[clerk-webhook] CLERK_WEBHOOK_SIGNING_SECRET is not set");
    } else {
      console.error("[clerk-webhook] Verification failed:", err);
    }
    // Do not leak verification details to the caller.
    return NextResponse.json({ ok: false, error: "Verification failed" }, { status: 400 });
  }

  if (event.type !== "user.created" && event.type !== "user.updated") {
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
