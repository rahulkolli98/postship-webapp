import { ConvexError } from "convex/values";

/**
 * Posting gate — born with TASK-052 ship path (PRD FR-008/010/011).
 *
 * POLICY (founder-approved): drafts are ALWAYS allowed; this gate controls
 * publishing only. Lives in an underscore file so Convex doesn't scan it
 * as a function module.
 *
 * Trial: 7 days / 5 ships lifetime (VISION.md § 5). Tier-based regen caps
 * and expanded limits land here in Phase 3 (TASK-067 scope addition).
 */

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TRIAL_POST_LIMIT = 5;

type PostGateUser = {
  subscriptionStatus: "trial" | "active" | "expired" | "canceled";
  trialStartedAt?: number;
  trialPostsUsed?: number;
};

/**
 * Throws a typed ConvexError (code + friendly message) when publishing
 * must be blocked. Returns silently when allowed. Metering is
 * attempt-based: called BEFORE publish, incremented after (TASK-049 notes).
 */
export function assertUserCanPost(user: PostGateUser): void {
  switch (user.subscriptionStatus) {
    case "active":
      return; // Pro/Creator — tier limits arrive with TASK-067
    case "trial": {
      const startedAt = user.trialStartedAt ?? 0;
      if (Date.now() - startedAt > TRIAL_DURATION_MS) {
        throw new ConvexError({
          code: "TRIAL_EXPIRED",
          message:
            "Your 7-day trial has ended. Your drafts are safe — upgrade to keep publishing.",
        });
      }
      if ((user.trialPostsUsed ?? 0) >= TRIAL_POST_LIMIT) {
        throw new ConvexError({
          code: "TRIAL_EXHAUSTED",
          message:
            "You've used all 5 trial posts. Upgrade to keep publishing.",
        });
      }
      return;
    }
    case "expired":
    case "canceled":
      throw new ConvexError({
        code: "UPGRADE_REQUIRED",
        message: "Your plan isn't active right now. Upgrade to publish.",
      });
  }
}
