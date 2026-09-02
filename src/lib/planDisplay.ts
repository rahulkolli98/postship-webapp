import type { Doc, Id } from "../../convex/_generated/dataModel";

/**
 * Shared plan-state derivation — TASK-068.
 *
 * One source of truth for "what does this user's plan look like right now",
 * consumed by the composer's TrialCounter badge and the billing page's
 * current-plan block. Pure given its inputs: callers pass a mount-time
 * `now` snapshot (render-phase Date.now() trips the React Compiler purity
 * rule — TASK-065 lesson).
 *
 * Tiers (TASK-067, founder decisions): Creator = 25 posts / rolling 30
 * days, no platform limits; Pro = unlimited; regen caps live in
 * rewrites.generate.
 */

const TRIAL_POST_LIMIT = 5;
const TRIAL_DURATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const CREATOR_MONTHLY_POST_LIMIT = 25;

export type PlanTone = "paid" | "muted" | "warning";

export type PlanDisplay = {
  tone: PlanTone;
  /** Short plan label: "Trial", "Creator", "Pro", "Trial ended", … */
  label: string;
  /** One-line state: usage / days left / upgrade nudge. */
  detail: string;
  /** Optional long-form note (billing page only): period end date. */
  note?: string;
  /** Compact one-line rendering for the composer badge. */
  badge?: string;
};

/** Structural slice of the users row — Doc<"users"> satisfies this. */
export type PlanUser = Pick<
  Doc<"users">,
  | "subscriptionStatus"
  | "subscriptionTier"
  | "trialStartedAt"
  | "trialPostsUsed"
  | "subscriptionPeriodEnd"
> & { _id: Id<"users"> };

function periodSuffix(user: PlanUser): string {
  if (typeof user.subscriptionPeriodEnd !== "number") return "";
  const d = new Date(user.subscriptionPeriodEnd);
  const formatted = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `Current period ends ${formatted}`;
}

export function planDisplay(
  user: PlanUser,
  opts: { monthlyPostCount?: number; now: number },
): PlanDisplay {
  const status = user.subscriptionStatus;

  if (status === "active") {
    const period = periodSuffix(user);
    if (user.subscriptionTier === "pro") {
      return {
        tone: "paid",
        label: "Pro",
        detail: "Unlimited posts across all 6 platforms",
        note: period || undefined,
        badge: "Pro plan · unlimited",
      };
    }
    // Legacy active rows without a tier are Creator (the paid floor).
    const used = opts.monthlyPostCount ?? 0;
    return {
      tone: "paid",
      label: "Creator",
      detail: `${used} of ${CREATOR_MONTHLY_POST_LIMIT} posts this month`,
      note: period || undefined,
      badge: `Creator · ${used} of ${CREATOR_MONTHLY_POST_LIMIT} this month`,
    };
  }

  if (status === "expired" || status === "canceled") {
    return {
      tone: "warning",
      label: "Plan ended",
      detail: "Upgrade to resume publishing",
      badge: "Plan ended · Upgrade to resume publishing",
    };
  }

  // Trial states.
  const startedAt = user.trialStartedAt ?? 0;
  const used = user.trialPostsUsed ?? 0;
  const remaining = startedAt + TRIAL_DURATION_DAYS * DAY_MS - opts.now;

  if (remaining <= 0) {
    return {
      tone: "warning",
      label: "Trial ended",
      detail: "Upgrade to keep publishing",
      badge: "Trial ended · Upgrade to keep posting",
    };
  }
  if (used >= TRIAL_POST_LIMIT) {
    return {
      tone: "warning",
      label: "Trial posts used",
      detail: "Upgrade to keep publishing",
      badge: "Trial posts used · Upgrade to keep posting",
    };
  }
  const daysLeft = Math.max(0, Math.ceil(remaining / DAY_MS));
  const detail = `${used} of ${TRIAL_POST_LIMIT} posts used · ${daysLeft} ${
    daysLeft === 1 ? "day" : "days"
  } left`;
  return {
    tone: "muted",
    label: "Trial",
    detail,
    badge: `Trial · ${detail}`,
  };
}
