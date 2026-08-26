import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

/**
 * Convex file storage — TASK-038 (PRD FR-003).
 *
 * Flow: client calls generateUploadUrl() → POSTs file bytes to that URL →
 * receives { storageId }. storageIds live in Composer React state until
 * posts.create (TASK-049) persists them in posts.videos[].
 *
 * Preview URLs are short-lived signed URLs via getUrl — never stored.
 * See convex/_generated/ai/guidelines.md:430 for the canonical pattern.
 */

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      throw new Error("Not authenticated");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return null;
    }
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * TASK-056b: batch signed URLs for draft resume — composer rebuilds video
 * previews from persisted storageIds.
 */
export const getUrls = query({
  args: { ids: v.array(v.id("_storage")) },
  returns: v.array(v.union(v.string(), v.null())),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return args.ids.map(() => null);
    }
    return await Promise.all(args.ids.map((id) => ctx.storage.getUrl(id)));
  },
});
