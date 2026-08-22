"use client";

import { Authenticated, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Trial counter badge (TASK-028 scope, built early with the composer empty
 * state per TASK-023 notes). Reads the signed-in user's trialPostsUsed.
 *
 * Copy per roadmap TASK-028: "Trial: X of 5 posts used", flipping to an
 * upgrade nudge when the 5-post lifetime quota is spent. Paid tiers show
 * plan usage later (Phase 3).
 */

const TRIAL_POST_LIMIT = 5;

export function TrialCounter() {
  return (
    <Authenticated>
      <TrialBadge />
    </Authenticated>
    // Signed-out visitors never see the composer (proxy gate), so no
    // Unauthenticated branch is needed; kept minimal on purpose.
  );
}

function TrialBadge() {
  const me = useQuery(api.users.current);

  if (me === undefined) {
    // Loading skeleton keeps layout stable while users.current resolves.
    return (
      <span className="inline-block h-6 w-32 animate-pulse rounded-md bg-muted" />
    );
  }

  const used = me?.trialPostsUsed ?? 0;
  const exhausted = used >= TRIAL_POST_LIMIT;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] ${
        exhausted
          ? "border-warning/60 bg-warning/10 text-warning"
          : "border-border bg-surface-raised text-on-surface-muted"
      }`}
      data-testid="trial-counter"
    >
      {exhausted ? (
        <>Trial posts used · Upgrade to keep posting</>
      ) : (
        <>
          Trial: {used} of {TRIAL_POST_LIMIT} posts used
        </>
      )}
    </span>
  );
}
