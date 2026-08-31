import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";

/**
 * Paddle webhook receiver — TASK-063 (PRD § 10).
 *
 * Contract verified from developer.paddle.com (signature-verification):
 *   - Header `Paddle-Signature: ts=<unix>;h1=<hex>` where h1 =
 *     HMAC-SHA256(`<ts>:<rawBody>`, destination secret).
 *   - The RAW body is required for the HMAC — request.text(), never .json()
 *     before verification.
 *   - Paddle retries on 4xx? No — 2xx acknowledges; failures on 5xx are
 *     retried. So: 401 on signature problems (dropped), 502 on Convex
 *     failures (retried), 400 on malformed bodies.
 *   - Replay window: reject timestamps older/newer than 5 minutes.
 *
 * The HMAC must be verified HERE (the route owns the raw body); the Convex
 * mutation then re-checks the shared secret so the public mutation cannot
 * be invoked directly to self-grant a subscription (PFM pattern).
 *
 * This route is intentionally public (PRD: `/api/webhooks/*` bypasses auth);
 * the webhook signature IS the authentication.
 */

// Module-scope singleton, same pattern as the other webhook routes.
const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210",
);

const MAX_AGE_SECONDS = 300;

function parseSignature(
  header: string | null,
): { ts: string; h1: string } | null {
  if (!header) return null;
  const match = header.match(/^ts=(\d+);h1=([a-f0-9]{64})$/);
  return match ? { ts: match[1], h1: match[2] } : null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[paddle-webhook] PADDLE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { ok: false, error: "Not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();

  // Malformed/missing signature: reject without needing the secret → these
  // paths are testable pre-configuration.
  const sig = parseSignature(request.headers.get("Paddle-Signature"));
  if (sig === null) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const ts = Number(sig.ts);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_AGE_SECONDS) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const expected = createHmac("sha256", secret)
    .update(`${sig.ts}:${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig.h1, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let event: { event_type?: unknown; data?: unknown };
  try {
    event = JSON.parse(rawBody) as { event_type?: unknown; data?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const eventType = typeof event.event_type === "string" ? event.event_type : "";
  if (eventType === "") {
    return NextResponse.json(
      { ok: false, error: "Missing event_type" },
      { status: 400 },
    );
  }

  try {
    const result = await convex.mutation(api.subscriptions.applyWebhookEvent, {
      secret,
      eventType,
      data: event.data ?? null,
    });
    if (result.unauthorized) {
      // Route HMAC passed but the Convex env secret disagrees → config drift.
      console.error(
        "[paddle-webhook] secret mismatch between route env and Convex env",
      );
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Log full detail server-side; return a generic body (no internals leak).
    console.error("[paddle-webhook] Convex mutation failed:", err);
    return NextResponse.json(
      { ok: false, error: "Processing failed" },
      { status: 502 },
    );
  }
}
