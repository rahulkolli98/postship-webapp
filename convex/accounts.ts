import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

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
