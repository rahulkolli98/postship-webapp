import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Paddle webhook → subscription state — TASK-063/064 (PRD § 10).
 *
 * Contract verified from developer.paddle.com (signature-verification +
 * subscription events) and the founder's live sandbox purchase:
 *   - Delivery: POST with header `Paddle-Signature: ts=<unix>;h1=<hex>` =
 *     HMAC-SHA256 over `<ts>:<rawBody>` with the notification destination's
 *     secret. The ROUTE verifies the HMAC (needs raw body + crypto); this
 *     mutation re-checks the shared secret so direct Convex invocation
 *     cannot self-grant "active" (PFM applyWebhookEvent pattern — a public
 *     mutation without the secret check would be a free-upgrade hole).
 *   - Event payload: {event_type, data}; subscription data carries
 *     status, customer_id, custom_data.clerkUserId (✅ proven flowing from
 *     the founder's purchase), items[].price.id, current_billing_period.
 *
 * State mapping (founder-approved 2026-08-31):
 *   active/trialing/past_due/paused → "active"   (payment-retry grace; PRD
 *     enum has no past_due/paused states — recorded as a decision)
 *   canceled → "canceled"
 *
 * Tier derives from items[].price.id matched against PADDLE_PRICE_CREATOR/
 * PADDLE_PRICE_PRO env — NEVER from custom_data. customData is set by our
 * app, but the client token is public: a malicious user could self-serve a
 * checkout with a spoofed custom_data.tier. The price they actually pay is
 * the only server-authoritative signal. Unknown price → status updates,
 * tier unchanged, loudly logged (honest).
 */

const webhookAck = v.object({
  ok: v.boolean(),
  unauthorized: v.optional(v.boolean()),
});

type PaddleSubscriptionData = {
  status?: unknown;
  customer_id?: unknown;
  custom_data?: { clerkUserId?: unknown } | null;
  customer?: { email?: unknown; emails?: unknown } | null;
  items?: Array<{ price?: { id?: unknown } | null } | null> | null;
  current_billing_period?: { ends_at?: unknown } | null;
};

function mapStatus(raw: string): "active" | "canceled" | null {
  switch (raw) {
    case "active":
    case "trialing":
    case "past_due":
    case "paused":
      return "active";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

export const applyWebhookEvent = mutation({
  args: {
    secret: v.string(),
    eventType: v.string(),
    data: v.any(),
  },
  returns: webhookAck,
  handler: async (
    ctx,
    { secret, eventType, data },
  ): Promise<{ ok: boolean; unauthorized?: boolean }> => {
    const expected = env.PADDLE_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      return { ok: false, unauthorized: true };
    }

    // Only subscription.* events drive state; transaction.completed and
    // friends are acked (subscription events are authoritative for state).
    if (!eventType.startsWith("subscription.")) {
      return { ok: true };
    }

    const d = (data ?? {}) as PaddleSubscriptionData;

    const rawStatus = typeof d.status === "string" ? d.status : "";
    const status = mapStatus(rawStatus);
    if (status === null) {
      console.error(
        "[paddle-webhook] unknown subscription status:",
        rawStatus.slice(0, 40),
      );
      return { ok: true };
    }

    // Server-authoritative tier from the billed price.
    const priceId = d.items?.[0]?.price?.id;
    let tier: "creator" | "pro" | null = null;
    if (priceId !== undefined && priceId !== null) {
      const pid = String(priceId);
      if (pid !== "" && pid === env.PADDLE_PRICE_CREATOR) tier = "creator";
      else if (pid !== "" && pid === env.PADDLE_PRICE_PRO) tier = "pro";
      else console.error("[paddle-webhook] unknown price id:", pid.slice(0, 40));
    }

    // Resolve the user: custom_data.clerkUserId (primary), then email.
    const clerkUserId =
      typeof d.custom_data?.clerkUserId === "string"
        ? d.custom_data.clerkUserId
        : null;
    let user: Doc<"users"> | null =
      clerkUserId !== null
        ? await ctx.runQuery(internal.users.getByClerkId, { clerkUserId })
        : null;

    if (user === null) {
      const email =
        typeof d.customer?.email === "string"
          ? d.customer.email
          : Array.isArray(d.customer?.emails) &&
              typeof d.customer.emails[0] === "string"
            ? (d.customer.emails[0] as string)
            : null;
      if (email !== null) {
        user =
          (await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", email))
            .first()) ?? null;
      }
    }

    if (user === null) {
      // Misconfiguration (checkout didn't ride through our app) — ack so
      // Paddle doesn't retry forever, but log loudly.
      console.error(
        "[paddle-webhook] no user for event:",
        eventType,
        "clerkUserId:",
        clerkUserId?.slice(0, 20) ?? "(none)",
      );
      return { ok: true };
    }

    const endsAtRaw = d.current_billing_period?.ends_at;
    const periodEnd =
      typeof endsAtRaw === "string" ? Date.parse(endsAtRaw) : NaN;

    await ctx.db.patch(user._id as Id<"users">, {
      subscriptionStatus: status,
      ...(tier !== null ? { subscriptionTier: tier } : {}),
      ...(Number.isFinite(periodEnd) ? { subscriptionPeriodEnd: periodEnd } : {}),
      ...(typeof d.customer_id === "string"
        ? { paddleCustomerId: d.customer_id }
        : {}),
    });
    return { ok: true };
  },
});
