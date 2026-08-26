import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertUserCanPost } from "./_guards";
import { PLATFORM } from "./accounts";
import { getCurrentUser } from "./users";
import { publish } from "../src/lib/publishing";
import { createPostForMeClient } from "../src/lib/publishing/postforme";
import type { PublishResult } from "../src/lib/publishing/types";

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

/** Per-platform ship outcome — shared by ship results + webhook updates (TASK-056). */
const resultEntry = v.object({
  status: v.union(
    v.literal("queued"),
    v.literal("uploading"),
    v.literal("posted"),
    v.literal("failed"),
  ),
  url: v.optional(v.string()),
  error: v.optional(v.string()),
  postedAt: v.optional(v.number()),
});

const shipResultsValidator = v.object({
  youtube: v.optional(resultEntry),
  linkedin: v.optional(resultEntry),
  x: v.optional(resultEntry),
  threads: v.optional(resultEntry),
  instagram: v.optional(resultEntry),
  tiktok: v.optional(resultEntry),
});

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
    // TASK-045b: founder-selected ship targets. Defaults to all six.
    platforms: v.optional(v.array(v.string())),
    // TASK-056b: save-as-draft — relaxes content/pairing checks, marks the
    // row resumable, skips platformResults init.
    isDraft: v.optional(v.boolean()),
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

    // ── Input sanity ─────────────────────────────────────────────────────
    // TASK-049b: master description is AI FUEL, not a publish requirement.
    // Manual-mode posts carry their content in platform captions, so no
    // minimum here (PRD FR-004's 20-char rule gates the Generate button
    // client-side only). Length cap stays as a sanity ceiling.
    const description = args.masterDescription.trim();
    if (description.length > 10_000) {
      throw new ConvexError("Master description is too long.");
    }
    // Drafts may have zero videos yet (save-early UX); ships need 1–2.
    if (args.videos.length > 2) {
      throw new ConvexError("Max 2 videos per post.");
    }
    if (!args.isDraft && args.videos.length < 1) {
      throw new ConvexError("Add a video before shipping.");
    }
    // At least one intended platform must carry real content — prevents
    // shipping fully empty posts in manual mode. (Drafts exempt.)
    if (!args.isDraft) {
      const hasContent = (args.platforms ?? [...PLATFORM_KEYS]).some((p) =>
        p === "youtube"
          ? args.rewrites.youtube.title.trim().length > 0 ||
            args.rewrites.youtube.description.trim().length > 0
          : (args.rewrites[p as Exclude<(typeof PLATFORM_KEYS)[number], "youtube">] ?? "").trim().length > 0,
      );
      if (!hasContent) {
        throw new ConvexError(
          "Add a caption for at least one platform before shipping.",
        );
      }
    }

    // Every INTENDED platform's pairing must reference an attached video.
    // (Drafts exempt — user may not have paired everything yet.)
    const intended = args.platforms ?? [...PLATFORM_KEYS];
    const invalidPlatform = intended.find(
      (p) => !(PLATFORM_KEYS as readonly string[]).includes(p),
    );
    if (invalidPlatform) {
      throw new ConvexError(`Unknown platform: ${invalidPlatform}`);
    }
    const attached = new Set<string>(args.videos.map((v) => String(v.storageId)));
    if (!args.isDraft) {
      for (const key of intended as (typeof PLATFORM_KEYS)[number][]) {
        if (!attached.has(args.pairings[key])) {
          throw new ConvexError(`Pairing for ${key} references a video that isn't attached.`);
        }
      }
    }

    const now = Date.now();
    return await ctx.db.insert("posts", {
      userId: user._id,
      masterDescription: args.masterDescription,
      videos: args.videos,
      rewrites: args.rewrites,
      pairings: args.pairings,
      platforms: intended,
      ...(args.isDraft ? ({ status: "draft" } as const) : {}),
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

// ── Ship path (TASK-052) ──────────────────────────────────────────────
//
// NOTE: this file must NOT carry "use node" — `create` above is a mutation,
// and the node directive applies to the whole module. The ship action uses
// only global fetch (via the publishing abstraction), so the default Convex
// runtime is fine.

/** Ownership-filtered post loader for actions (no ctx.db in action ctx). */
export const getOwned = internalQuery({
  args: { postId: v.id("posts"), userId: v.id("users") },
  handler: async (ctx, { postId, userId }) => {
    const post = await ctx.db.get(postId);
    if (post === null || post.userId !== userId) return null;
    return post;
  },
});

/** Merge per-platform ship results into the stored platformResults. */
export const applyShipUpdate = internalMutation({
  args: {
    postId: v.id("posts"),
    results: shipResultsValidator,
    markPublished: v.boolean(),
  },
  handler: async (ctx, { postId, results, markPublished }) => {
    const post = await ctx.db.get(postId);
    if (post === null) return null;

    const merged = { ...post.platformResults };
    for (const key of PLATFORM_KEYS) {
      const incoming = results[key];
      if (incoming) merged[key] = incoming;
    }

    await ctx.db.patch(postId, {
      platformResults: merged,
      ...(markPublished ? { publishedAt: Date.now() } : {}),
    });
    return null;
  },
});

/**
 * PRD FR-008 — posts.ship. Publishes the paired media + captions for every
 * CONNECTED platform through the publishing abstraction (Post for Me v1).
 *
 * Sequence: auth → gate (assertUserCanPost) → ownership → connected targets
 * → signed media URLs → publish() → applyShipUpdate → incrementTrialPosts.
 *
  * Attempt-based metering: the trial counter increments even if individual
  * platforms fail (founder-approved, TASK-052 plan). Final posted/failed
  * states arrive via PFM webhooks (TASK-056); results here start at
  * "uploading"/"failed".
  *
  * TASK-056b: shipping a loaded DRAFT promotes that row (fields refreshed,
  * draft status cleared) instead of creating a duplicate.
  */
export const ship = action({
  args: { postId: v.id("posts") },
  returns: v.object({
    postId: v.id("posts"),
    results: shipResultsValidator,
  }),
  handler: async (
    ctx,
    { postId },
  ): Promise<{ postId: Id<"posts">; results: PublishResult }> => {
    // ── Auth ───────────────────────────────────────────────────────────
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    const user = await ctx.runQuery(internal.users.getByClerkId, {
      clerkUserId: identity.subject,
    });
    if (user === null) throw new Error("Not authenticated");

    // ── Gate (trial window/quota; tiers expand in TASK-067) ────────────
    assertUserCanPost(user);

    // ── Post + ownership ───────────────────────────────────────────────
    const post = await ctx.runQuery(internal.posts.getOwned, {
      postId,
      userId: user._id,
    });
    if (post === null) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Post not found." });
    }

    // ── Signed media URLs (PFM fetches from these) ─────────────────────
    const urlById = new Map<string, string>();
    for (const video of post.videos) {
      const url = await ctx.storage.getUrl(video.storageId);
      if (!url) {
        throw new ConvexError({
          code: "MEDIA_MISSING",
          message: `Stored video "${video.filename}" is no longer retrievable. Re-upload and try again.`,
        });
      }
      urlById.set(String(video.storageId), url);
    }

    // ── Connected targets ∩ founder-selected platforms ─────────────────
    const intended: string[] = post.platforms ?? [...PLATFORM_KEYS];
    const accountRows = await ctx.runQuery(internal.accounts.listInternal, {
      userId: user._id,
    });
    type Target = {
      platform: (typeof PLATFORM_KEYS)[number];
      socialAccountId: string;
      caption: string;
      media: Array<{ url: string; filename: string; aspectRatio?: string }>;
    };
    const targets: Target[] = [];
    for (const row of accountRows) {
      if (!row.platformUserId) continue;                     // not connected
      if (!intended.includes(row.platform)) continue;        // deselected

      const storageId = post.pairings[row.platform];
      const url = storageId ? urlById.get(storageId) : undefined;
      const media = url
        ? [{
            url,
            filename:
              post.videos.find((v) => String(v.storageId) === storageId)
                ?.filename ?? "video",
            aspectRatio:
              post.videos.find((v) => String(v.storageId) === storageId)
                ?.aspectRatio,
          }]
        : [];

      // Quota care: only bill platforms with real content. YouTube carries
      // structured fields instead of a caption.
      if (row.platform === "youtube") {
        const yt = post.rewrites.youtube;
        if (!yt.title && !yt.description) continue;
        targets.push({ platform: row.platform, socialAccountId: row.platformUserId, caption: "", media });
      } else {
        const caption = post.rewrites[row.platform] ?? "";
        if (caption.trim().length === 0) continue;
        targets.push({ platform: row.platform, socialAccountId: row.platformUserId, caption, media });
      }
    }

    if (targets.length === 0) {
      throw new ConvexError({
        code: "NO_CONNECTIONS",
        message:
          "Nothing to ship yet — connect a platform and add captions for your selected networks.",
      });
    }

    // ── Publish via abstraction ────────────────────────────────────────
    const apiKey = env.POSTFORME_API_KEY ?? null;
    if (!apiKey) {
      throw new ConvexError({
        code: "PUBLISHING_NOT_CONFIGURED",
        message:
          "Publishing backend not configured. Set POSTFORME_API_KEY via `npx convex env set` (see docs/HANDOFF.md).",
      });
    }
    const client = createPostForMeClient(apiKey);
    const results = await publish(client, {
      masterDescription: post.masterDescription,
      captions: post.rewrites,
      media: post.videos.map((v) => ({
        url: urlById.get(String(v.storageId)) as string,
        filename: v.filename,
        aspectRatio: v.aspectRatio,
      })),
      targets,
      youtube: targets.some((t) => t.platform === "youtube")
        ? post.rewrites.youtube
        : undefined,
      externalId: String(post._id),
    });

    // ── Persist results + meter the attempt ────────────────────────────
    await ctx.runMutation(internal.posts.applyShipUpdate, {
      postId,
      results: results as typeof shipResultsValidator.type,
      markPublished: true,
    });
    await ctx.runMutation(internal.users.incrementTrialPosts, {
      userId: user._id,
    });

    return { postId, results };
  },
});

// ── Draft save & resume (TASK-056b) ─────────────────────────────────────

const draftFieldsValidator = v.object({
  masterDescription: v.string(),
  videos: v.array(videoValidator),
  rewrites: rewritesValidator,
  pairings: pairingsValidator,
  platforms: v.array(v.string()),
});

/** Most recent draft for the caller, or null. Hydrates the composer. */
export const latestDraft = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;

    const rows = await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return (
      rows
        .filter((r) => r.status === "draft")
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    );
  },
});

/**
 * Refresh an existing draft's fields. Auth + ownership + still-a-draft
 * checks; clears the draft status when promoted for ship (client does
 * updateDraft → ship with the same id).
 */
export const updateDraft = mutation({
  args: {
    draftId: v.id("posts"),
    fields: draftFieldsValidator,
    promote: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { draftId, fields, promote }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    const user = await ctx.runQuery(internal.users.getByClerkId, {
      clerkUserId: identity.subject,
    });
    if (user === null) throw new Error("Not authenticated");

    const post = await ctx.db.get(draftId);
    if (post === null || post.userId !== user._id) {
      throw new ConvexError("Draft not found.");
    }
    if (post.status !== "draft") {
      throw new ConvexError("This post was already shipped.");
    }

    await ctx.db.patch(draftId, {
      masterDescription: fields.masterDescription,
      videos: fields.videos,
      rewrites: fields.rewrites,
      pairings: fields.pairings,
      platforms: fields.platforms,
      // Promote (ship path): remove the draft marker entirely.
      ...(promote ? { status: undefined } : {}),
    });
    return null;
  },
});

/** Delete a draft row (user discard). Files remain for the 056 cron sweep. */
export const discardDraft = mutation({
  args: { draftId: v.id("posts") },
  returns: v.null(),
  handler: async (ctx, { draftId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    const user = await ctx.runQuery(internal.users.getByClerkId, {
      clerkUserId: identity.subject,
    });
    if (user === null) throw new Error("Not authenticated");

    const post = await ctx.db.get(draftId);
    if (post === null || post.userId !== user._id) return null;
    if (post.status !== "draft") return null;

    await ctx.db.delete(draftId);
    return null;
  },
});
// ── Post history (TASK-059, PRD FR-009) ─────────────────────────────────

const historyEntryValidator = v.object({
  _id: v.id("posts"),
  _creationTime: v.number(),
  masterDescription: v.string(),
  platforms: v.optional(v.array(v.string())),
  status: v.optional(v.literal("draft")),
  publishedAt: v.optional(v.number()),
  platformResults: v.object({
    youtube: v.optional(resultEntry),
    linkedin: v.optional(resultEntry),
    x: v.optional(resultEntry),
    threads: v.optional(resultEntry),
    instagram: v.optional(resultEntry),
    tiktok: v.optional(resultEntry),
  }),
  rewrites: rewritesValidator,
});

/**
 * TASK-059: last 50 shipped posts (reverse-chronological) + all drafts
 * (most recent first), in one query. Rewrites included — the expanded
 * history row shows full captions. Videos/storageIds intentionally
 * excluded (not needed for display; keeps payload lean).
 */
export const listHistory = query({
  args: {},
  returns: v.object({
    shipped: v.array(historyEntryValidator),
    drafts: v.array(historyEntryValidator),
  }),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return { shipped: [], drafts: [] };
    }

    const rows = await ctx.db
      .query("posts")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(60); // headroom so 50 shipped + drafts both survive the cut

    const shipped = rows
      .filter((r) => r.status !== "draft")
      .slice(0, 50)
      .map((r) => ({
        _id: r._id,
        _creationTime: r._creationTime,
        masterDescription: r.masterDescription,
        platforms: r.platforms,
        status: r.status,
        publishedAt: r.publishedAt,
        platformResults: r.platformResults,
        rewrites: r.rewrites,
      }));

    const drafts = rows
      .filter((r) => r.status === "draft")
      .slice(0, 10)
      .map((r) => ({
        _id: r._id,
        _creationTime: r._creationTime,
        masterDescription: r.masterDescription,
        platforms: r.platforms,
        status: r.status,
        publishedAt: r.publishedAt,
        platformResults: r.platformResults,
        rewrites: r.rewrites,
      }));

    return { shipped, drafts };
  },
});
