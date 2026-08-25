import {
  internalQuery,
  query,
  mutation,
} from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

/** Shared six-platform union validator (used by posts.pairings too). */
export const PLATFORM = v.union(
  v.literal("youtube"),
  v.literal("linkedin"),
  v.literal("x"),
  v.literal("threads"),
  v.literal("instagram"),
  v.literal("tiktok"),
);

/**
 * PRD § 4: accounts.list (TASK-024)
 *
 * Returns the caller's connected platforms, newest first.
 *
 * SECURITY PROJECTION: rows carry OAuth access/refresh tokens that must
 * never reach a client (PRD § 2 Security Considerations). This query
 * returns only display-safe fields; token handling stays server-side in
 * the publishing layer (Phase 2).
 */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("accounts"),
      platform: v.union(
        v.literal("youtube"),
        v.literal("linkedin"),
        v.literal("x"),
        v.literal("threads"),
        v.literal("instagram"),
        v.literal("tiktok"),
      ),
      platformUsername: v.optional(v.string()),
      platformDisplayName: v.optional(v.string()),
      platformAvatarUrl: v.optional(v.string()),
      connectedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return [];
    }

    const rows = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return rows
      .map(({ _id, platform, platformUsername, platformDisplayName, platformAvatarUrl, connectedAt }) => ({
        _id,
        platform,
        platformUsername,
        platformDisplayName,
        platformAvatarUrl,
        connectedAt,
      }))
      .sort((a, b) => b.connectedAt - a.connectedAt);
  },
});

/**
 * PRD § 4: accounts.disconnect (TASK-027)
 *
 * Removes one connected platform. Auth-guarded: resolves the caller via
 * getCurrentUser and only deletes rows belonging to them.
 */
export const disconnect = mutation({
  args: { platform: PLATFORM },
  returns: v.null(),
  handler: async (ctx, { platform }) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      throw new Error("Not authenticated");
    }

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId_platform", (q) =>
        q.eq("userId", user._id).eq("platform", platform),
      )
      .first();

    if (account !== null) {
      await ctx.db.delete(account._id);
    }
    return null;
  },
});

/**
 * v1 brand-level disconnect (roadmap TASK-027 notes): the Post for Me
 * connection is one brand covering up to six platform rows, so the UI's
 * "Disconnect all" removes every row for the caller in one go.
 */
/**
 * TASK-053: upsert a PFM-connected platform for the given Clerk user.
 *
 * PUBLIC mutation (called from the OAuth callback HTTP route via
 * ConvexHttpClient, which cannot invoke internals) — same documented
 * bounded-harm tradeoff as users.upsertFromClerk. Hardening idea once
 * routes obtain Convex auth tokens: flip to internal + identity check.
 *
 * Harm model if forged: attacker attaches THEIR sa_ ids to a victim's row;
 * victim ships would publish to attacker-owned accounts (attacker gains
 * nothing) or spam rows. Platform is constrained to the six literals and
 * rows per call are capped upstream.
 */
export const upsertFromPostForMe = mutation({
  args: {
    clerkUserId: v.string(),
    platform: PLATFORM,
    platformUserId: v.string(),
    platformUsername: v.optional(v.string()),
    platformDisplayName: v.optional(v.string()),
    platformAvatarUrl: v.optional(v.string()),
    accessToken: v.string(), // sentinel "__PFM_MANAGED__" — PFM owns tokens
  },
  returns: v.id("accounts"),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", args.clerkUserId),
      )
      .unique();
    if (user === null) {
      throw new Error("Unknown user: sign up before connecting platforms.");
    }

    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_userId_platform", (q) =>
        q.eq("userId", user._id).eq("platform", args.platform),
      )
      .first();

    const fields = {
      platformUserId: args.platformUserId,
      platformUsername: args.platformUsername,
      platformDisplayName: args.platformDisplayName,
      platformAvatarUrl: args.platformAvatarUrl,
      accessToken: args.accessToken,
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("accounts", {
      userId: user._id,
      platform: args.platform,
      ...fields,
      scopes: ["posts"],
      connectedAt: Date.now(),
    });
  },
});

/**
 * Internal raw-rows query for server-side flows (TASK-052 ship). Unlike
 * the public `list`, this INCLUDES tokens + provider account ids — it must
 * never be registered as a public function.
 */
export const listInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
});

export const disconnectAll = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      throw new Error("Not authenticated");
    }

    const rows = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});
