import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PLATFORM } from "./accounts";

/**
 * posts.create — TASK-049 (PRD § 4).
 *
 * Persists one Ship attempt: master description + videos (with metadata) +
 * rewrites + pairings, initializing every platform to "queued".
 *
 * POLICY (founder-approved 2026-08-23): drafts are always allowed — trial
 * quota / expiry enforcement happens at SHIP only (FR-008; landing-page FAQ
 * promises "drafts stay, you lose the ability to publish"). So this
 * mutation checks auth + input sanity, nothing else. assertUserCanPost()
 * is born with the ship path (TASK-052/065/067).
 *
 * DEVIATION from PRD literal: pairings store storageIds, not video indexes.
 */

const PLATFORM_KEYS = ["youtube", "linkedin", "x", "threads", "instagram", "tiktok"] as const;

const videoValidator = v.object({
  storageId: v.id("_storage"),
  filename: v.string(),
  durationSeconds: v.optional(v.number()),
  aspectRatio: v.optional(v.string()),
});

const rewritesValidator = v.object({
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
});

const pairingsValidator = v.object({
  youtube: v.string(), // storageId
  linkedin: v.string(),
  x: v.string(),
  threads: v.string(),
  instagram: v.string(),
  tiktok: v.string(),
});

export const create = mutation({
  args: {
    masterDescription: v.string(),
    videos: v.array(videoValidator),
    rewrites: rewritesValidator,
    pairings: pairingsValidator,
  },
  returns: v.id("posts"),
  handler: async (ctx, args): Promise<Id<"posts">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    const user = await ctx.runQuery(internal.users.getByClerkId, {
      clerkUserId: identity.subject,
    });
    if (user === null) {
      throw new Error("Not authenticated");
    }

    // ── Input sanity (PRD FR-003 / FR-004 / §11) ────────────────────────
    const description = args.masterDescription.trim();
    if (description.length < 20) {
      throw new ConvexError("Master description must be at least 20 characters.");
    }
    if (description.length > 10_000) {
      throw new ConvexError("Master description is too long.");
    }
    if (args.videos.length < 1 || args.videos.length > 2) {
      throw new ConvexError("Add 1 or 2 videos before shipping.");
    }

    // Every pairing must reference an attached video.
    const attached = new Set<string>(args.videos.map((v) => String(v.storageId)));
    for (const key of PLATFORM_KEYS) {
      if (!attached.has(args.pairings[key])) {
        throw new ConvexError(`Pairing for ${key} references a video that isn't attached.`);
      }
    }

    const now = Date.now();
    return await ctx.db.insert("posts", {
      userId: user._id,
      masterDescription: args.masterDescription,
      videos: args.videos,
      rewrites: args.rewrites,
      pairings: args.pairings,
      platformResults: {
        youtube: { status: "queued" },
        linkedin: { status: "queued" },
        x: { status: "queued" },
        threads: { status: "queued" },
        instagram: { status: "queued" },
        tiktok: { status: "queued" },
      },
      createdAt: now,
    });
  },
});
