import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * TASK-075: Post for Me brand-health check — daily cron (crons.ts, 03:00
 * UTC), also runnable manually from the Convex dashboard function runner
 * for verification.
 *
 * For every user with account rows: call PFM `GET /v1/social-accounts`
 * (Bearer POSTFORME_API_KEY, same contract verified in TASK-053) and keep
 * rows stamped with THAT user's external_id and status "connected" (the
 * TASK-053b isolation filter). Compare against our rows by platformUserId
 * (sa_ id — stable across renames):
 *   - our row missing/not connected at PFM → needsReconnect = true
 *   - our row healthy again (user reconnected) → flag cleared
 * Token refresh is PFM's job; this only detects disconnects/deletions.
 *
 * HONESTY RULE: only mark on a DEFINITIVE PFM response. If the fetch fails
 * or errors, log and skip that user — a PFM outage must never mass-flag
 * everyone as disconnected.
 */

// Same conservative mapping as the PFM OAuth callback ("twitter" → "x").
const PLATFORM_KEYS = ["youtube", "linkedin", "x", "threads", "instagram", "tiktok"];

function normalizePlatform(raw: string): string | null {
  const p = raw.trim().toLowerCase();
  if (p === "twitter") return "x";
  return (PLATFORM_KEYS as string[]).includes(p) ? p : null;
}

const PFM_BASE_URL = "https://api.postforme.dev/v1";

/** Paginate users; the action skips those without account rows. */
export const pageUsers = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    users: v.array(
      v.object({ _id: v.id("users"), clerkUserId: v.string() }),
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    users: Array<{ _id: Id<"users">; clerkUserId: string }>;
    continueCursor: string;
    isDone: boolean;
  }> => {
    const page = await ctx.db.query("users").paginate({
      numItems: 100,
      cursor: args.cursor,
    });
    return {
      users: page.page.map((u) => ({ _id: u._id, clerkUserId: u.clerkUserId })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Raw account rows for one user (projection includes the flag + sa id). */
export const accountRows = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("accounts"),
      platformUserId: v.string(),
      needsReconnect: v.optional(v.boolean()),
    }),
  ),
  handler: async (
    ctx,
    { userId },
  ): Promise<
    Array<{ _id: Id<"accounts">; platformUserId: string; needsReconnect?: boolean }>
  > => {
    const rows = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      platformUserId: r.platformUserId,
      needsReconnect: r.needsReconnect,
    }));
  },
});

export const markNeedsReconnect = internalMutation({
  args: { accountId: v.id("accounts"), needsReconnect: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { accountId, needsReconnect }): Promise<null> => {
    await ctx.db.patch(accountId, { needsReconnect });
    return null;
  },
});

export const checkBrandHealth = internalAction({
  args: {},
  returns: v.object({
    checked: v.number(),
    flagged: v.number(),
    cleared: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{ checked: number; flagged: number; cleared: number }> => {
    const apiKey = env.POSTFORME_API_KEY ?? null;
    if (!apiKey) {
      console.error(
        "[brand-health] POSTFORME_API_KEY not set — check skipped",
      );
      return { checked: 0, flagged: 0, cleared: 0 };
    }

    let cursor: string | null = null;
    let checked = 0;
    let flagged = 0;
    let cleared = 0;

    for (;;) {
      const page: {
        users: Array<{ _id: Id<"users">; clerkUserId: string }>;
        continueCursor: string;
        isDone: boolean;
      } = await ctx.runQuery(internal.brandHealth.pageUsers, { cursor });

      for (const u of page.users) {
        const rows: Array<{
          _id: Id<"accounts">;
          platformUserId: string;
          needsReconnect?: boolean;
        }> = await ctx.runQuery(internal.brandHealth.accountRows, {
          userId: u._id,
        });
        if (rows.length === 0) continue;

        // Definitive response or skip — never mark on uncertainty.
        let connectedSa: Set<string>;
        try {
          const res = await fetch(`${PFM_BASE_URL}/social-accounts`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) {
            console.error(
              "[brand-health] PFM fetch failed:",
              res.status,
              "— skipping user",
              u.clerkUserId.slice(0, 12),
            );
            continue;
          }
          const payload = (await res.json().catch(() => null)) as
            | { data?: Array<Record<string, unknown>> }
            | Array<Record<string, unknown>>
            | null;
          const list = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.data)
              ? payload.data
              : [];
          connectedSa = new Set<string>();
          for (const raw of list) {
            if (raw.external_id !== u.clerkUserId) continue;
            if (raw.status !== "connected") continue;
            const id = typeof raw.id === "string" ? raw.id : null;
            if (id) connectedSa.add(id);
            // Platform sanity (twitter→x mapping) — informational only; the
            // sa_ id is the matching key.
            void normalizePlatform(String(raw.platform ?? ""));
          }
        } catch (err) {
          console.error(
            "[brand-health] fetch errored — skipping user:",
            err instanceof Error ? err.message : err,
          );
          continue;
        }

        checked += 1;
        for (const row of rows) {
          const healthy = connectedSa.has(row.platformUserId);
          if (healthy === true && row.needsReconnect !== true) continue;
          if (healthy === false && row.needsReconnect === true) continue;
          await ctx.runMutation(internal.brandHealth.markNeedsReconnect, {
            accountId: row._id,
            needsReconnect: !healthy,
          });
          if (healthy) cleared += 1;
          else flagged += 1;
        }
      }

      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    console.log(
      `[brand-health] checked ${checked} users, flagged ${flagged}, cleared ${cleared}`,
    );
    return { checked, flagged, cleared };
  },
});
