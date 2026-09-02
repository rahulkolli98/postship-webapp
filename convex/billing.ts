import { action } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Paddle customer portal — TASK-068 (PRD US-016 / FR-011).
 *
 * Creates an authenticated Paddle-hosted portal session for the CALLER'S
 * OWN customer (users.paddleCustomerId, stamped by the TASK-063 webhook)
 * and returns `urls.general.overview`. The portal lets customers manage
 * payment methods, invoices, and cancellations without us building billing
 * screens. Paddle explicitly advises against embedding the portal — the UI
 * opens it in a new tab.
 *
 * Contract verified from vendor docs + the Paddle MCP API reference:
 *   POST {base}/customers/{customer_id}/portal-sessions
 *   Authorization: Bearer <PADDLE_API_KEY>
 *   → { data: { urls: { general: { overview: "https://…" } } } }
 * Base URL is environment-scoped: sandbox-api.paddle.com vs api.paddle.com,
 * selected by the same NEXT_PUBLIC_PADDLE_ENV the checkout uses (build-time
 * inlined — sandbox now, live flips in at TASK-081).
 *
 * Security: the portal is always for the caller's own customer id, so no
 * cross-user access is possible. Users who never purchased (no
 * paddleCustomerId) get url: null and the UI hides the button.
 */

const PORTAL_BASE_URLS = {
  sandbox: "https://sandbox-api.paddle.com",
  production: "https://api.paddle.com",
} as const;

export const createPortalSession = action({
  args: {},
  returns: v.object({ url: v.union(v.string(), v.null()) }),
  handler: async (ctx): Promise<{ url: string | null }> => {
    // Actions have their own ctx shape — resolve identity via the internal
    // projected query (includes paddleCustomerId, excludes nothing sensitive
    // we'd expose: the id never leaves this handler).
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    const user = await ctx.runQuery(internal.users.getByClerkId, {
      clerkUserId: identity.subject,
    });
    if (user === null) throw new Error("Not authenticated");

    if (!user.paddleCustomerId) {
      // Never purchased — nothing to manage yet.
      return { url: null };
    }

    const apiKey = env.PADDLE_API_KEY ?? null;
    if (!apiKey) {
      throw new ConvexError({
        code: "PORTAL_NOT_CONFIGURED",
        message: "Billing portal isn't configured yet.",
      });
    }

    const environment =
      process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
        ? "production"
        : "sandbox";
    const base = PORTAL_BASE_URLS[environment];

    const res = await fetch(
      `${base}/customers/${user.paddleCustomerId}/portal-sessions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error(
        "[billing] portal session rejected:",
        res.status,
        bodyText.slice(0, 300),
      );
      throw new ConvexError({
        code: "PORTAL_FAILED",
        message: "Couldn't open the billing portal. Try again.",
      });
    }

    const payload = (await res.json().catch(() => ({}))) as {
      data?: { urls?: { general?: { overview?: string } } };
    };
    const url = payload?.data?.urls?.general?.overview ?? null;
    if (!url) {
      console.error("[billing] portal session returned no overview url");
      throw new ConvexError({
        code: "PORTAL_FAILED",
        message: "Couldn't open the billing portal. Try again.",
      });
    }
    return { url };
  },
});
