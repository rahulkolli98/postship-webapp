import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * PRD § 4: users.upsertFromClerk
 *
 * Create or update the Convex user record from a Clerk webhook event.
 * Idempotent on clerkUserId (by_clerkUserId index): second delivery of the
 * same event patches instead of inserting. New records start on the trial
 * clock (7 days / 5 posts — see VISION.md § 5).
 *
 * CALLED ONLY BY THE CLERK WEBHOOK ROUTE (src/app/api/webhooks/clerk).
 * It is intentionally a public mutation because the Next.js route talks to
 * Convex over ConvexHttpClient, which cannot invoke internal functions.
 * Known limitation until TASK-021 wires Clerk JWTs into Convex auth:
 * a caller who knows the deployment URL could forge rows. Harm is bounded
 * (spam rows only; dedupe by clerkUserId caps one row per Clerk ID), and
 * hardening lands with identity-based guards in Phase 1's auth tasks.
 */
export const upsertFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        displayName: args.displayName,
        avatarUrl: args.avatarUrl,
      });
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl,
      createdAt: now,
      subscriptionStatus: "trial",
      trialStartedAt: now,
      trialPostsUsed: 0,
    });
  },
});
