"use client";

import { Authenticated, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { planDisplay } from "../../lib/planDisplay";

/**
 * Trial/plan counter badge — TASK-065/066/068.
 *
 * Renders the shared plan-state derivation (src/lib/planDisplay.ts) as a
 * compact badge: paid tiers show plan usage ("Creator · X of 25 this
 * month" / "Pro plan · unlimited"), trial shows posts used + days left,
 * expired/exhausted show upgrade nudges. All state logic lives in the
 * shared helper so the billing page and this badge can never disagree.
 *
 * Backend gate + increment existed since TASK-052 (assertUserCanPost +
 * incrementTrialPosts); test lever: users.devSetTrialStartedAt.
 */

export function TrialCounter() {
  return (
    <Authenticated>
      <TrialBadge />
    </Authenticated>
    // Signed-out visitors never see the composer (proxy gate), so no
    // Unauthenticated branch is needed; kept minimal on purpose.
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "paid" | "muted" | "warning";
  children: React.ReactNode;
}) {
  const TONE_CLASSES = {
    paid: "border-success/60 bg-success/10 text-success",
    muted: "border-border bg-surface-raised text-on-surface-muted",
    warning: "border-warning/60 bg-warning/10 text-warning",
  } as const;

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
  const usage = useQuery(api.posts.monthlyUsage);
  // Mount-time snapshot: the countdown badge doesn't need per-frame
  // precision, and a render-phase Date.now() trips the React Compiler
  // purity rule. One stable read per mount is the intended behavior.
  const [now] = useState(() => Date.now());

  if (me === undefined || usage === undefined) {
    // Loading skeleton keeps layout stable while the queries resolve.
    return (
      <span className="inline-block h-6 w-32 animate-pulse rounded-md bg-muted" />
    );
  }
  if (me === null) return null;

  const plan = planDisplay(me, {
    monthlyPostCount: usage.monthlyPostCount,
    now,
  });
  return <Badge tone={plan.tone}>{plan.badge ?? `${plan.label} · ${plan.detail}`}</Badge>;
}
