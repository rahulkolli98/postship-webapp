import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Shared helper (PRD § 4): resolve the Clerk identity to the Convex users
 * record. Every authenticated function calls this first. Returns null when
 * signed out or when the webhook hasn't created the row yet.
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    return null;
  }
  return ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

/**
 * PRD § 4: users.current (TASK-020)
 *
 * Returns the Convex user record for the currently authenticated Clerk
 * identity, or null when signed out. The identity comes from the Clerk JWT
 * validated via convex/auth.config.ts; `identity.subject` IS the Clerk user
 * id (`user_...`) that upsertFromClerk stores as clerkUserId.
 *
 * Client components calling this must sit under <Authenticated> (or guard
 * with useConvexAuth()) — otherwise it throws on page load per Convex docs.
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .unique();
  },
});

/**
 * Internal helper for actions (like rewrites.generate) that cannot access
 * ctx.db directly. Resolves the caller's Clerk identity to the Convex user
 * row; used via ctx.runQuery(internal.users.getByClerkId).
 */
export const getByClerkId = internalQuery({
  args: { clerkUserId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      clerkUserId: v.string(),
      email: v.string(),
      displayName: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      createdAt: v.number(),
      subscriptionStatus: v.union(
        v.literal("trial"),
        v.literal("active"),
        v.literal("expired"),
        v.literal("canceled"),
      ),
      subscriptionTier: v.optional(v.union(v.literal("creator"), v.literal("pro"))),
      subscriptionPeriodEnd: v.optional(v.number()),
      revenuecatCustomerId: v.optional(v.string()),
      trialStartedAt: v.optional(v.number()),
      trialPostsUsed: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, { clerkUserId }) =>
    ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique(),
});

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

/**
 * PRD FR-008: increment the trial ship counter. Called by posts.ship AFTER
 * a successful publish attempt (attempt-based metering). No-op for paid
 * tiers — only trial users carry the 5-post lifetime quota.
 */
export const incrementTrialPosts = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user === null || user.subscriptionStatus !== "trial") {
      return null;
    }
    await ctx.db.patch(userId, {
      trialPostsUsed: (user.trialPostsUsed ?? 0) + 1,
    });
    return null;
  },
});

/**
 * Dev/debug tool: reset a user's trial counter to zero. Runs via CLI
 * (`npx convex run users:resetTrialPosts '{"userId":"…"}'`) — internal,
 * so no client can reach it. Useful when test ships burn quota.
 */
export const resetTrialPosts = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { trialPostsUsed: 0 });
    return null;
  },
});
