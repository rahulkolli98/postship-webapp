import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Per-platform publish outcome (PRD § 3). Shared validator so create/ship/
 * retry stay in lockstep.
 */
const platformResult = {
  status: v.union(
    v.literal("queued"),
    v.literal("uploading"),
    v.literal("posted"),
    v.literal("failed"),
  ),
  url: v.optional(v.string()),
  error: v.optional(v.string()),
  postedAt: v.optional(v.number()),
};

/**
 * Convex schema — webapp.
 *
 * Phase 2 scope: `users`, `accounts`, `posts` (TASK-049). The landing app
 * owns `waitlist` exclusively — do NOT copy it here.
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

  /**
   * Posts — PRD § 3. One row per Ship attempt (drafts are the composer's
   * ephemeral state until this row exists).
   *
   * DEVIATION from PRD literal (2026-08-23, founder-approved): `pairings`
   * maps platform → **storageId** instead of video array index — indexes
   * silently change meaning when videos are removed/reordered; ids don't.
   */
  posts: defineTable({
    userId: v.id("users"),
    masterDescription: v.string(),
    videos: v.array(
      v.object({
        storageId: v.id("_storage"),
        filename: v.string(),
        durationSeconds: v.optional(v.number()),
        aspectRatio: v.optional(v.string()), // "16:9" | "9:16" | "1:1"
      }),
    ),
    rewrites: v.object({
      youtube: v.object({
        title: v.string(),
        description: v.string(),
        tags: v.array(v.string()),
      }),
      linkedin: v.string(),
      x: v.string(),
      threads: v.string(),
      instagram: v.string(),
      tiktok: v.string(),
    }),
    pairings: v.object({
      youtube: v.string(), // storageId
      linkedin: v.string(),
      x: v.string(),
      threads: v.string(),
      instagram: v.string(),
      tiktok: v.string(),
    }),
    publishedAt: v.optional(v.number()),
    /** Intended ship targets (founder-selected in composer). Optional for rows created before TASK-045b. */
    platforms: v.optional(v.array(v.string())),
    platformResults: v.object({
      youtube: v.optional(v.object(platformResult)),
      linkedin: v.optional(v.object(platformResult)),
      x: v.optional(v.object(platformResult)),
      threads: v.optional(v.object(platformResult)),
      instagram: v.optional(v.object(platformResult)),
      tiktok: v.optional(v.object(platformResult)),
    }),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),
});
