"use client";

import { Authenticated, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";

/**
 * Trial/plan counter badge — TASK-065/066.
 *
 * Four honest states (founder-approved 2026-08-31):
 *   - Paid (active + tier): "{Creator|Pro} plan" — monthly usage counting
 *     lands with TASK-067 gating; no trial language for paying users.
 *   - Trial active: "Trial: X of 5 posts used · N days left" — the 7-day
 *     clock is now visible (was invisible before this task).
 *   - Trial expired: "Trial ended · Upgrade to keep posting" (warning).
 *   - Trial exhausted (within window): existing upgrade nudge.
 *   - expired/canceled subscriptions (webhook states): "Plan ended".
 *
 * Backend gate + increment existed since TASK-052 (assertUserCanPost +
 * incrementTrialPosts); this task is the UI truth + the dev test lever
 * (users.devSetTrialStartedAt) for verification.
 */

const TRIAL_POST_LIMIT = 5;
const TRIAL_DURATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type Tone = "paid" | "muted" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  paid: "border-success/60 bg-success/10 text-success",
  muted: "border-border bg-surface-raised text-on-surface-muted",
  warning: "border-warning/60 bg-warning/10 text-warning",
};

export function TrialCounter() {
  return (
    <Authenticated>
      <TrialBadge />
    </Authenticated>
    // Signed-out visitors never see the composer (proxy gate), so no
    // Unauthenticated branch is needed; kept minimal on purpose.
  );
}

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${TONE_CLASSES[tone]}`}
      data-testid="trial-counter"
    >
      {children}
    </span>
  );
}

function TrialBadge() {
  const me = useQuery(api.users.current);
  // Mount-time snapshot: the countdown badge doesn't need per-frame
  // precision, and a render-phase Date.now() trips the React Compiler
  // purity rule. One stable read per mount is the intended behavior.
  const [now] = useState(() => Date.now());

  if (me === undefined) {
    // Loading skeleton keeps layout stable while users.current resolves.
    return (
      <span className="inline-block h-6 w-32 animate-pulse rounded-md bg-muted" />
    );
  }
  if (me === null) return null;

  const status = me.subscriptionStatus;

  // Paid tiers — no trial language for paying users.
  if (status === "active") {
    const tier = me.subscriptionTier === "pro" ? "Pro" : "Creator";
    return <Badge tone="paid">{tier} plan</Badge>;
  }
  if (status === "expired" || status === "canceled") {
    return <Badge tone="warning">Plan ended · Upgrade to keep posting</Badge>;
  }

  // Trial states.
  const startedAt = me.trialStartedAt ?? 0;
  const used = me.trialPostsUsed ?? 0;
  const remaining = startedAt + TRIAL_DURATION_DAYS * DAY_MS - now;

  if (remaining <= 0) {
    return (
      <Badge tone="warning">Trial ended · Upgrade to keep posting</Badge>
    );
  }
  if (used >= TRIAL_POST_LIMIT) {
    return (
      <Badge tone="warning">Trial posts used · Upgrade to keep posting</Badge>
    );
  }

  const daysLeft = Math.max(0, Math.ceil(remaining / DAY_MS));
  return (
    <Badge tone="muted">
      Trial: {used} of {TRIAL_POST_LIMIT} posts used · {daysLeft}{" "}
      {daysLeft === 1 ? "day" : "days"} left
    </Badge>
  );
}
