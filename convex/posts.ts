import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
import type { Platform, PublishResult } from "../src/lib/publishing/types";

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

/**
 * TASK-067: non-draft posts the user created since `since` (rolling 30-day
 * window) — the Creator monthly-ship metric. Rolling = capacity frees up
 * as old posts age past the window (no calendar reset).
 */
export const countRecentPosts = internalQuery({
  args: { userId: v.id("users"), since: v.number() },
  returns: v.number(),
  handler: async (ctx, { userId, since }) => {
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", userId).gte("createdAt", since),
      )
      .collect();
    return rows.filter((r) => r.status !== "draft").length;
  },
});

/** TASK-067: public monthly usage for the billing counter (paid Creator). */
export const monthlyUsage = query({
  args: {},
  returns: v.object({ monthlyPostCount: v.number() }),
  handler: async (ctx): Promise<{ monthlyPostCount: number }> => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return { monthlyPostCount: 0 };
    }
    return {
      monthlyPostCount: await ctx.runQuery(internal.posts.countRecentPosts, {
        userId: user._id,
        since: Date.now() - 30 * 24 * 60 * 60 * 1000,
      }),
    };
  },
});

/** Merge per-platform ship results into the stored platformResults. */
export const applyShipUpdate = internalMutation({
  args: {
    postId: v.id("posts"),
    results: shipResultsValidator,
    markPublished: v.boolean(),
    // TASK-056: stamp platform → sa_… so webhook results (keyed by sa_)
    // map back to platforms even after the user reconnects accounts.
    pfmAccountMap: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, { postId, results, markPublished, pfmAccountMap }) => {
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
      ...(pfmAccountMap ? { pfmAccountMap } : {}),
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

    // ── Gate (trial window/quota + TASK-067 tier caps) ─────────────────
    // Creator: 25 posts / rolling 30 days (counted, not counter-maintained).
    const monthlyPostCount = await ctx.runQuery(internal.posts.countRecentPosts, {
      userId: user._id,
      since: Date.now() - 30 * 24 * 60 * 60 * 1000,
    });
    assertUserCanPost(user, { monthlyPostCount });

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
    // TASK-056: sa_… → platform snapshot for webhook result mapping.
      pfmAccountMap: Object.fromEntries(
        targets.map((t) => [t.socialAccountId, t.platform]),
      ),
    });
    await ctx.runMutation(internal.users.incrementTrialPosts, {
      userId: user._id,
    });

    return { postId, results };
  },
});

/**
 * Retry one failed platform without charging another trial post.
 *
 * The original posts._id is reused as PFM's external_id, so a retry remains
 * idempotent at the provider boundary. Final status still arrives through
 * the TASK-056 webhook path.
 */
export const retryPlatform = action({
  args: {
    postId: v.id("posts"),
    platform: v.union(
      v.literal("youtube"),
      v.literal("linkedin"),
      v.literal("x"),
      v.literal("threads"),
      v.literal("instagram"),
      v.literal("tiktok"),
    ),
  },
  returns: v.object({
    platform: v.string(),
    result: resultEntry,
  }),
  handler: async (ctx, { postId, platform }): Promise<{
    platform: string;
    result: {
      status: "queued" | "uploading" | "posted" | "failed";
      url?: string;
      error?: string;
      postedAt?: number;
    };
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not authenticated");
    const user = await ctx.runQuery(internal.users.getByClerkId, {
      clerkUserId: identity.subject,
    });
    if (user === null) throw new Error("Not authenticated");

    const post = await ctx.runQuery(internal.posts.getOwned, {
      postId,
      userId: user._id,
    });
    if (post === null || post.status === "draft") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Post not found." });
    }

    const current = post.platformResults[platform];
    if (!current || current.status !== "failed") {
      throw new ConvexError({
        code: "RETRY_NOT_ALLOWED",
        message: "Only failed platforms can be retried.",
      });
    }

    const account = (await ctx.runQuery(internal.accounts.listInternal, {
      userId: user._id,
    })).find((row) => row.platform === platform && row.platformUserId);
    if (!account) {
      throw new ConvexError({
        code: "NO_CONNECTIONS",
        message: `Reconnect ${platform} before retrying.`,
      });
    }

    const storageId = post.pairings[platform];
    const video = post.videos.find((item) => String(item.storageId) === storageId);
    if (!storageId || !video) {
      throw new ConvexError({
        code: "MEDIA_MISSING",
        message: "The paired video is no longer attached. Re-upload and try again.",
      });
    }
    const url = await ctx.storage.getUrl(video.storageId);
    if (!url) {
      throw new ConvexError({
        code: "MEDIA_MISSING",
        message: `Stored video "${video.filename}" is no longer retrievable. Re-upload and try again.`,
      });
    }

    const apiKey = env.POSTFORME_API_KEY ?? null;
    if (!apiKey) {
      throw new ConvexError({
        code: "PUBLISHING_NOT_CONFIGURED",
        message: "Publishing backend not configured. Set POSTFORME_API_KEY.",
      });
    }

    const target = {
      platform: platform as Platform,
      socialAccountId: account.platformUserId,
      caption:
        platform === "youtube"
          ? ""
          : (post.rewrites[platform as Exclude<Platform, "youtube">] ?? ""),
      media: [{
        url,
        filename: video.filename,
        aspectRatio: video.aspectRatio,
      }],
    };
    const client = createPostForMeClient(apiKey);
    const results = await publish(client, {
      masterDescription: post.masterDescription,
      captions: post.rewrites,
      media: target.media,
      targets: [target],
      youtube: platform === "youtube" ? post.rewrites.youtube : undefined,
      externalId: String(post._id),
    });
    const result = results[platform] ?? {
      status: "failed" as const,
      error: "Publishing backend returned no result.",
    };

    await ctx.runMutation(internal.posts.applyShipUpdate, {
      postId,
      results: { [platform]: result },
      markPublished: false,
      pfmAccountMap: { [account.platformUserId]: platform },
    });

    return { platform, result };
  },
});

/** Live status projection for the current user's shipped post. */
export const status = query({
  args: { postId: v.id("posts") },
  returns: v.union(
    v.object({
      platforms: v.optional(v.array(v.string())),
      platformResults: shipResultsValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, { postId }) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    const post = await ctx.db.get(postId);
    if (post === null || post.userId !== user._id || post.status === "draft") {
      return null;
    }
    return {
      platforms: post.platforms,
      platformResults: post.platformResults,
    };
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

/**
 * Most recent draft for the caller, or null. Hydrates the composer.
 * TASK-059: sorts on savedAt (bumped by resumeDraft) falling back to
 * createdAt — so resuming a draft from History makes it the working draft.
 */
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
        .sort(
          (a, b) => (b.savedAt ?? b.createdAt) - (a.savedAt ?? a.createdAt),
        )[0] ?? null
    );
  },
});

/**
 * TASK-059: shipped posts for the History page — last 50, newest first,
 * drafts excluded. Videos/storageIds deliberately excluded (metadata-only
 * projection; expansion shows captions + result URLs, not media).
 */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("posts"),
      _creationTime: v.number(),
      masterDescription: v.string(),
      platforms: v.optional(v.array(v.string())),
      platformResults: v.object({
        youtube: v.optional(resultEntry),
        linkedin: v.optional(resultEntry),
        x: v.optional(resultEntry),
        threads: v.optional(resultEntry),
        instagram: v.optional(resultEntry),
        tiktok: v.optional(resultEntry),
      }),
      rewrites: rewritesValidator,
      publishedAt: v.optional(v.number()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return [];

    const rows = await ctx.db
      .query("posts")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);

    return rows
      .filter((r) => r.status !== "draft")
      .map((r) => ({
        _id: r._id,
        _creationTime: r._creationTime,
        masterDescription: r.masterDescription,
        platforms: r.platforms,
        platformResults: r.platformResults,
        rewrites: r.rewrites,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
      }));
  },
});

/**
 * TASK-059: all drafts for the History page's Drafts section, newest save
 * first. Same metadata-only projection as `list` plus savedAt.
 */
export const listDrafts = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("posts"),
      _creationTime: v.number(),
      savedAt: v.optional(v.number()),
      masterDescription: v.string(),
      platforms: v.optional(v.array(v.string())),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return [];

    const rows = await ctx.db
      .query("posts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    return rows
      .filter((r) => r.status === "draft")
      .map(({ _id, _creationTime, savedAt, masterDescription, platforms, createdAt }) => ({
        _id,
        _creationTime,
        savedAt,
        masterDescription,
        platforms,
        createdAt,
      }))
      .sort(
        (a, b) => (b.savedAt ?? b.createdAt) - (a.savedAt ?? a.createdAt),
      );
  },
});

/**
 * TASK-059: bump a draft's savedAt so it becomes the composer's working
 * draft (Resume from History). Auth + ownership + draft-status guarded.
 */
export const resumeDraft = mutation({
  args: { draftId: v.id("posts") },
  returns: v.null(),
  handler: async (ctx, { draftId }) => {
    const user = await getCurrentUser(ctx);
    if (user === null) throw new Error("Not authenticated");

    const post = await ctx.db.get(draftId);
    if (post === null || post.userId !== user._id) {
      throw new ConvexError("Draft not found.");
    }
    if (post.status !== "draft") return null;

    await ctx.db.patch(draftId, { savedAt: Date.now() });
    return null;
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

    // Phase A storage policy: videos removed during editing are purged
    // immediately (storage ids are per-session uploads, never shared).
    const nextIds = new Set(fields.videos.map((v) => String(v.storageId)));
    for (const video of post.videos) {
      if (!nextIds.has(String(video.storageId))) {
        await ctx.storage.delete(video.storageId);
      }
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

/** Delete a draft row (user discard). Video files are purged with the row. */
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

    // Phase A storage policy: a discarded draft's files have no future
    // reference — purge now so deleted rows don't orphan storage.
    for (const video of post.videos) {
      await ctx.storage.delete(video.storageId);
    }
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

// ── Post for Me webhooks + storage lifecycle (TASK-056) ─────────────────
//
// Contract verified from vendor source (DayMoonDevelopment/post-for-me):
//   Delivery: POST {our url}, header `Post-For-Me-Webhook-Secret: <whsec_>`,
//   body {event_type, data}. PFM retries 8× with backoff and a 1s timeout
//   per attempt — the Next route stays a thin forwarder and acks fast; all
//   real work happens in Convex (secret check in the mutation, network in
//   a scheduled action).
//
//   Event mapping (v1):
//   - social.post.updated (status=processed) → the ONLY finalization
//     trigger. Its data (SocialPostDto) carries id + external_id (= our
//     posts._id) + status.
//   - social.post.result.created → acked and ignored: SocialPostResultDto
//     has NO external_id, so incremental events can't resolve our row.
//     finalizeFromApi fetches the authoritative result set from
//     GET /v1/social-post-results?post_id=… instead.
//   - social.account.* → acked; account sync stays OAuth-callback-driven.
//
//   Merge policy: results are authoritative but never DOWNGRADE — only
//   queued/uploading rows transition to posted/failed, so PFM's 8-retry
//   redelivery is naturally idempotent.
//
//   Storage policy (founder-approved Phase A): delete-after-ship — media is
//   purged immediately once every intended platform is posted; anything
//   else waits for the daily sweep (48h expiry, retry window preserved).

/** System-level row loader for webhook/sweep paths (no user auth). */
export const getAnyPost = internalQuery({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => ctx.db.get(postId),
});

const webhookAck = v.object({
  ok: v.boolean(),
  unauthorized: v.optional(v.boolean()),
});

/**
 * Public webhook entry — the Next route forwards the raw event here. The
 * PFM secret is checked against POSTFORME_WEBHOOK_SECRET (convex env), so
 * the deployment URL alone is not enough to invoke this meaningfully.
 */
export const applyWebhookEvent = mutation({
  args: {
    secret: v.string(),
    eventType: v.string(),
    data: v.any(),
  },
  returns: webhookAck,
  handler: async (ctx, { secret, eventType, data }): Promise<{ ok: boolean; unauthorized?: boolean }> => {
    const expected = env.POSTFORME_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      return { ok: false, unauthorized: true };
    }

    if (eventType === "social.post.updated") {
      const d = (data ?? {}) as {
        id?: unknown;
        external_id?: unknown;
        status?: unknown;
      };
      const externalId =
        typeof d.external_id === "string" ? d.external_id : null;
      const pfmPostId = typeof d.id === "string" ? d.id : null;
      const status = typeof d.status === "string" ? d.status : null;

      if (status === "processed" && externalId) {
        // external_id IS our posts._id (set at ship). Guard against garbage
        // shapes: malformed strings would fail the v.id() validator inside
        // the scheduled query and spam retries — only pass plausible ids.
        if (/^[a-z0-9]{16,64}$/.test(externalId)) {
          await ctx.scheduler.runAfter(0, internal.posts.finalizeFromApi, {
            postId: externalId as Id<"posts">,
            ...(pfmPostId ? { pfmPostId } : {}),
            postStatus: status,
          });
        } else {
          console.error(
            "[pfm-webhook] post.updated with unusable external_id:",
            externalId.slice(0, 80),
          );
        }
      }
      return { ok: true };
    }

    // result.created / account.* / post.created / post.deleted: ack.
    return { ok: true };
  },
});

/** Merge webhook results (no-downgrade) and optionally purge shipped media. */
export const applyWebhookMerge = internalMutation({
  args: {
    postId: v.id("posts"),
    results: shipResultsValidator,
    deleteMedia: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { postId, results, deleteMedia }) => {
    const post = await ctx.db.get(postId);
    if (post === null) return null;

    type WidenEntry = { status: string; url?: string; error?: string; postedAt?: number };
    const current = post.platformResults as Record<string, WidenEntry | undefined>;
    const incoming = results as Record<string, WidenEntry | undefined>;
    const merged = { ...post.platformResults } as Record<string, WidenEntry | undefined>;
    let changed = false;
    for (const key of PLATFORM_KEYS) {
      const next = incoming[key];
      const prev = current[key];
      if (!next) continue;
      // Never downgrade a terminal state (PFM retries redeliver events).
      if (prev && (prev.status === "posted" || prev.status === "failed")) {
        continue;
      }
      if (!prev || prev.status !== next.status || prev.url !== next.url) {
        merged[key] = next;
        changed = true;
      }
    }
    if (changed) {
      await ctx.db.patch(postId, {
        platformResults: merged as typeof post.platformResults,
      });
    }

    if (deleteMedia && post.mediaDeletedAt === undefined && post.videos.length > 0) {
      // Storage ids are per-upload and never shared across posts (composer
      // uploads are per-session), so deleting here cannot break other rows.
      for (const video of post.videos) {
        await ctx.storage.delete(video.storageId);
      }
      await ctx.db.patch(postId, {
        videos: [],
        mediaDeletedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Authoritative finalization: fetch per-account results from the PFM API
 * and merge truth into platformResults. Triggered by post.updated(processed)
 * and by the daily sweep for posts stuck in uploading (missed webhooks).
 */
export const finalizeFromApi = internalAction({
  args: {
    postId: v.id("posts"),
    pfmPostId: v.optional(v.string()),
    postStatus: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { postId, pfmPostId, postStatus }) => {
    const post = await ctx.runQuery(internal.posts.getAnyPost, { postId });
    if (post === null) return null;
    if (post.status === "draft" || !post.publishedAt) return null;

    const apiKey = env.POSTFORME_API_KEY;
    if (!apiKey) {
      console.error("[pfm-finalize] POSTFORME_API_KEY not set; cannot reconcile");
      return null;
    }
    // Same live base as the publishing client (/v1 prefix required).
    const baseUrl = "https://api.postforme.dev/v1";
    const headers = { Authorization: `Bearer ${apiKey}` };

    // Resolve the provider post id: webhooks supply it directly; the sweep
    // path resolves via external_id (verified supported on GET /social-posts).
    let providerPostId = pfmPostId ?? null;
    let providerStatus = postStatus ?? null;
    if (!providerPostId || !providerStatus) {
      try {
        const res = await fetch(
          `${baseUrl}/social-posts?external_id=${encodeURIComponent(String(post._id))}`,
          { headers },
        );
        if (!res.ok) {
          console.error("[pfm-finalize] social-posts lookup failed:", res.status);
          return null;
        }
        const payload = (await res.json()) as
          | { data?: Array<{ id?: string; status?: string }> }
          | Array<{ id?: string; status?: string }>;
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
        providerPostId = providerPostId ?? rows[0]?.id ?? null;
        providerStatus = providerStatus ?? rows[0]?.status ?? null;
      } catch (err) {
        console.error("[pfm-finalize] social-posts lookup errored:", err);
        return null;
      }
    }
    if (!providerPostId) {
      console.warn("[pfm-finalize] no provider post id; skipping", String(post._id));
      return null;
    }

    // Authoritative per-account results.
    let resultRows: Array<{
      social_account_id?: unknown;
      success?: unknown;
      error?: unknown;
      platform_data?: { url?: unknown } | null;
    }> = [];
    try {
      const res = await fetch(
        `${baseUrl}/social-post-results?post_id=${encodeURIComponent(providerPostId)}`,
        { headers },
      );
      if (!res.ok) {
        console.error("[pfm-finalize] results fetch failed:", res.status);
        return null;
      }
      const payload = (await res.json()) as
        | { data?: unknown[] }
        | unknown[];
      resultRows = (
        Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
      ) as typeof resultRows;
    } catch (err) {
      console.error("[pfm-finalize] results fetch errored:", err);
      return null;
    }

    // Map sa_ → platform via the ship-time snapshot.
    const accountMap = post.pfmAccountMap ?? {};
    const current = post.platformResults as Record<
      string,
      { status: string } | undefined
    >;
    const updates: Record<
      string,
      { status: "posted" | "failed"; url?: string; error?: string; postedAt?: number }
    > = {};
    const reportedAccounts = new Set<string>();
    for (const row of resultRows) {
      const sa = typeof row.social_account_id === "string" ? row.social_account_id : null;
      if (!sa) continue;
      reportedAccounts.add(sa);
      const platform = accountMap[sa];
      if (!platform || !(PLATFORM_KEYS as readonly string[]).includes(platform)) continue;
      const prev = current[platform];
      if (prev && (prev.status === "posted" || prev.status === "failed")) continue;
      const resultUrl =
        row.platform_data && typeof row.platform_data.url === "string"
          ? row.platform_data.url
          : undefined;
      updates[platform] =
        row.success === true
          ? { status: "posted", ...(resultUrl ? { url: resultUrl } : {}), postedAt: Date.now() }
          : {
              status: "failed",
              error:
                typeof row.error === "string" && row.error.trim().length > 0
                  ? row.error
                  : "Publishing failed.",
            };
    }

    // Honesty fallback (founder transparency rule): once PFM reports the post
    // processed, any intended platform still pending without a result has no
    // recoverable outcome — mark it failed rather than leave a fake spinner.
    if (providerStatus === "processed") {
      const intended: string[] = post.platforms ?? [...PLATFORM_KEYS];
      for (const platform of intended) {
        if (updates[platform]) continue;
        const prev = current[platform];
        if (prev && (prev.status === "posted" || prev.status === "failed")) continue;
        const sa = Object.entries(accountMap).find(([, p]) => p === platform)?.[0];
        if (!sa || !reportedAccounts.has(sa)) {
          updates[platform] = {
            status: "failed",
            error: "Publishing outcome unavailable — connection changed during publishing. Reconnect and retry.",
          };
        }
      }
    }

    // Storage policy: purge media only when EVERY intended platform posted
    // (failed platforms keep their media for TASK-055 retry; the 48h sweep
    // is the backstop for anything unretried).
    const intendedAll: string[] = post.platforms ?? [...PLATFORM_KEYS];
    const allPosted = intendedAll.every((p) => {
      const status = updates[p]?.status ?? current[p]?.status;
      return status === "posted";
    });
    const deleteMedia =
      allPosted && post.mediaDeletedAt === undefined && post.videos.length > 0;

    await ctx.runMutation(internal.posts.applyWebhookMerge, {
      postId,
      results: updates as typeof shipResultsValidator.type,
      deleteMedia,
    });
    return null;
  },
});

// ── Daily sweep (crons.ts schedules this) ────────────────────────────────

/** Two sweep candidate sets: stuck-uploading (reconcile) + stale media (purge). */
export const sweepCandidates = internalQuery({
  args: { staleBefore: v.number(), stuckBefore: v.number() },
  returns: v.object({
    stale: v.array(v.id("posts")),
    stuck: v.array(v.id("posts")),
  }),
  handler: async (ctx, { staleBefore, stuckBefore }) => {
    const stale: Id<"posts">[] = [];
    const stuck: Id<"posts">[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page = await ctx.db.query("posts").paginate({
        numItems: 100,
        cursor,
      });
      for (const p of page.page) {
        if (p.status === "draft" || !p.publishedAt || p.mediaDeletedAt !== undefined) {
          continue;
        }
        if (p.publishedAt < staleBefore) {
          stale.push(p._id);
          continue;
        }
        if (p.publishedAt < stuckBefore) {
          const results = p.platformResults as Record<
            string,
            { status?: string } | undefined
          >;
          const intended: string[] = p.platforms ?? [...PLATFORM_KEYS];
          const hasPending = intended.some((k) => {
            const r = results[k];
            return !r || r.status === "queued" || r.status === "uploading";
          });
          if (hasPending) stuck.push(p._id);
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return { stale, stuck };
  },
});

/**
 * Daily maintenance: (1) re-finalize posts stuck in uploading for >30min
 * (missed webhooks — idempotent via no-downgrade merge), (2) purge media
 * from shipped posts older than 48h regardless of outcome (retry window
 * closed; founder-approved Phase A lifecycle).
 */
export const sweepMedia = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const { stale, stuck } = await ctx.runQuery(internal.posts.sweepCandidates, {
      staleBefore: now - 48 * 60 * 60 * 1000,
      stuckBefore: now - 30 * 60 * 1000,
    });

    for (const postId of stuck) {
      await ctx.scheduler.runAfter(0, internal.posts.finalizeFromApi, { postId });
    }
    for (const postId of stale) {
      await ctx.runMutation(internal.posts.purgePostMedia, { postId });
    }
    if (stuck.length > 0 || stale.length > 0) {
      console.log(
        `[pfm-sweep] reconciled ${stuck.length} stuck, purged ${stale.length} stale`,
      );
    }
    return null;
  },
});

/** Delete a shipped post's video files + flag the row (48h expiry path). */
export const purgePostMedia = internalMutation({
  args: { postId: v.id("posts") },
  returns: v.null(),
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (post === null || post.mediaDeletedAt !== undefined) return null;
    for (const video of post.videos) {
      await ctx.storage.delete(video.storageId);
    }
    await ctx.db.patch(postId, { videos: [], mediaDeletedAt: Date.now() });
    return null;
  },
});

// ── Dev levers (TASK-067 verification; internal-only) ───────────────────

/**
 * TASK-067 test lever: insert `count` minimal SHIPPED post rows inside the
 * rolling 30-day window so the Creator 25-cap is testable without 25 real
 * ships. Run via the Convex dashboard function runner.
 */
export const devSeedMonthlyPosts = internalMutation({
  args: { clerkUserId: v.string(), count: v.number() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId, count }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (user === null) {
      throw new Error(`Unknown clerkUserId: ${clerkUserId.slice(0, 12)}…`);
    }
    const emptyRewrites = {
      youtube: { title: "", description: "", tags: [] },
      linkedin: "",
      x: "",
      threads: "",
      instagram: "",
      tiktok: "",
    };
    const emptyPairings = {
      youtube: "",
      linkedin: "",
      x: "",
      threads: "",
      instagram: "",
      tiktok: "",
    };
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("posts", {
        userId: user._id,
        masterDescription: "dev seed (TASK-067 verification)",
        videos: [],
        rewrites: emptyRewrites,
        pairings: emptyPairings,
        platforms: [],
        platformResults: {
          youtube: { status: "posted" },
          linkedin: { status: "posted" },
          x: { status: "posted" },
          threads: { status: "posted" },
          instagram: { status: "posted" },
          tiktok: { status: "posted" },
        },
        publishedAt: now,
        createdAt: now,
      });
    }
    return null;
  },
});

