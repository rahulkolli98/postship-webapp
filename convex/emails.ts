import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  sendEmail,
  trialExpiryEmail,
  DEFAULT_APP_URL,
  DEFAULT_EMAIL_FROM,
} from "../src/lib/email";

/**
 * TASK-069: trial-expiry-24h email — daily cron (crons.ts, 14:00 UTC).
 *
 * Finds TRIAL users whose 7-day clock lands within the next 24h, sends the
 * expiry notice, and marks trialExpiryNotified so the daily run never
 * double-sends. Idempotency-Key also guards Resend-side retries.
 *
 * Trial users are few at this scale, so this paginates the users table and
 * filters in-page (same pattern as the media sweep). If trials grow large,
 * add a compound index on (subscriptionStatus, trialStartedAt).
 *
 * Sandbox note: the default Resend sender only delivers to the account
 * owner's address until a domain is verified (launch item).
 */

const TRIAL_DURATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const pageTrialUsers = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    /** Expiry must land at or before this timestamp (now + 24h). */
    expiryBy: v.number(),
    now: v.number(),
  },
  returns: v.object({
    users: v.array(v.object({ _id: v.id("users"), email: v.string() })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    users: Array<{ _id: import("./_generated/dataModel").Id<"users">; email: string }>;
    continueCursor: string;
    isDone: boolean;
  }> => {
    const page = await ctx.db.query("users").paginate({
      numItems: 100,
      cursor: args.cursor,
    });
    const users = page.page
      .filter(
        (u) =>
          u.subscriptionStatus === "trial" &&
          u.trialExpiryNotified !== true &&
          typeof u.email === "string" &&
          u.email.length > 0,
      )
      .filter((u) => {
        const expiresAt = (u.trialStartedAt ?? 0) + TRIAL_DURATION_DAYS * DAY_MS;
        // Expiry inside the window: not already past, lands within 24h.
        return expiresAt > args.now && expiresAt <= args.expiryBy;
      })
      .map((u) => ({ _id: u._id, email: u.email }));
    return {
      users,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const markNotified = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }): Promise<null> => {
    await ctx.db.patch(userId, { trialExpiryNotified: true });
    return null;
  },
});

export const sendTrialExpiryEmails = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const apiKey = env.RESEND_API_KEY ?? null;
    if (!apiKey) {
      console.error("[emails] RESEND_API_KEY not set — expiry emails skipped");
      return null;
    }
    const from = env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM;
    const appUrl = env.APP_URL ?? DEFAULT_APP_URL;

    const now = Date.now();
    const expiryBy = now + DAY_MS; // expires within 24h of this run

    let cursor: string | null = null;
    let sent = 0;
    for (;;) {
      const page: {
        users: Array<{ _id: import("./_generated/dataModel").Id<"users">; email: string }>;
        continueCursor: string;
        isDone: boolean;
      } = await ctx.runQuery(internal.emails.pageTrialUsers, {
        cursor,
        expiryBy,
        now,
      });

      for (const u of page.users) {
        const tpl = trialExpiryEmail(appUrl);
        const result = await sendEmail({
          apiKey,
          from,
          to: u.email,
          subject: tpl.subject,
          html: tpl.html,
          idempotencyKey: `trial-expiry-${u._id}`,
        });
        if (result.ok) {
          sent += 1;
          await ctx.runMutation(internal.emails.markNotified, {
            userId: u._id,
          });
        }
      }

      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    if (sent > 0) console.log(`[emails] trial expiry notices sent: ${sent}`);
    return null;
  },
});
