import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";

/**
 * Post for Me webhook receiver — TASK-056.
 *
 * PFM delivers events as POST with header `Post-For-Me-Webhook-Secret` and
 * body {event_type, data}, retrying 8× with backoff and a 1s timeout per
 * attempt. This route is intentionally a THIN FORWARDER: it does no secret
 * logic itself — it relays the header + parsed body to the Convex mutation
 * `posts.applyWebhookEvent`, which checks the secret against
 * POSTFORME_WEBHOOK_SECRET (convex env) and schedules the network work.
 * That keeps p99 latency here far under PFM's 1s delivery timeout.
 *
 * Contract verified from vendor source (trigger/process-webhook-event.ts,
 * api/src/webhooks/dto/*): 3xx–599 responses trigger their retry/backoff,
 * so this route maps unauthorized → 401 and processing failures → 502 and
 * lets PFM's redelivery drive convergence (the Convex merge is idempotent).
 *
 * This route is intentionally public (PRD: `/api/webhooks/*` bypasses auth);
 * the webhook secret IS the authentication.
 */

// Module-scope singleton, same pattern as the Clerk webhook route.
const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210",
);

type PfmWebhookBody = {
  event_type?: unknown;
  data?: unknown;
};

export async function POST(request: NextRequest) {
  const secret = request.headers.get("Post-For-Me-Webhook-Secret") ?? "";

  let body: PfmWebhookBody;
  try {
    body = (await request.json()) as PfmWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.event_type !== "string" || body.event_type.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing event_type" },
      { status: 400 },
    );
  }

  try {
    const result = await convex.mutation(api.posts.applyWebhookEvent, {
      secret,
      eventType: body.event_type,
      data: body.data ?? null,
    });
    if (result.unauthorized) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Log full detail server-side; return a generic body (no internals leak).
    console.error("[pfm-webhook] Convex mutation failed:", err);
    return NextResponse.json(
      { ok: false, error: "Processing failed" },
      { status: 502 },
    );
  }
}
