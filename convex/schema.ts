import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema — webapp.
 *
 * Phase 1 scope: `users` + `accounts` (TASK-018/020/024). The rest of PRD § 3
 * lands with its owning tasks: `posts` with TASK-049. The landing app owns
 * `waitlist` exclusively — do NOT copy it here.
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

  /**
   * Connected social platforms (PRD § 3). v1 reality: one Post for Me brand
   * connection mints up to six rows here (one per platform), written by the
   * OAuth callback (TASK-053). Tokens are stored encrypted at that boundary;
   * they must never leave the server (see accounts.list projection).
   */
  accounts: defineTable({
    userId: v.id("users"),
    platform: v.union(
      v.literal("youtube"),
      v.literal("linkedin"),
      v.literal("x"),
      v.literal("threads"),
      v.literal("instagram"),
      v.literal("tiktok"),
    ),
    platformUserId: v.string(),
    platformUsername: v.optional(v.string()),
    platformDisplayName: v.optional(v.string()),
    platformAvatarUrl: v.optional(v.string()),
    // OAuth tokens (encrypted at rest before insert — TASK-053)
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    connectedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_platform", ["userId", "platform"]),
});
