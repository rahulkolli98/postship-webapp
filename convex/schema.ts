import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema — webapp.
 *
 * Phase 1 scope: `users` first (TASK-018/019 need it). The rest of PRD § 3
 * lands with its owning tasks: `accounts` with TASK-024, `posts` with
 * TASK-049. The landing app owns `waitlist` exclusively — do NOT copy it here.
 */
export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(), // Unique, from Clerk (identity.subject)
    email: v.string(),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(), // Unix timestamp
    // Subscription state (RevenueCat writes these later, TASK-063/064)
    subscriptionStatus: v.union(
      v.literal("trial"),
      v.literal("active"),
      v.literal("expired"),
      v.literal("canceled"),
    ),
    subscriptionTier: v.optional(v.union(v.literal("creator"), v.literal("pro"))),
    subscriptionPeriodEnd: v.optional(v.number()),
    revenuecatCustomerId: v.optional(v.string()),
    // Trial tracking (7 days / 5 posts lifetime)
    trialStartedAt: v.optional(v.number()),
    trialPostsUsed: v.optional(v.number()),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"]),
});
