"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { initPaddle, startCheckout } from "../../lib/paddle";

/**
 * BillingPortal — TASK-062 (PRD FR-011).
 *
 * Two tier cards opening the Paddle overlay checkout (sandbox-first):
 *   - Price IDs from NEXT_PUBLIC_PADDLE_PRICE_* env (sandbox `pri_…` now,
 *     live IDs flip in at TASK-081).
 *   - Clerk email pre-fills the customer; customData.clerkUserId rides to
 *     the TASK-063 webhook for user resolution.
 *   - After payment Paddle redirects to /settings/billing?upgraded=1 →
 *     success banner. Convex state does NOT change from this screen — the
 *     webhook is the source of truth (063/064).
 *   - Graceful "billing unavailable" when the client token is absent:
 *     initPaddle() resolves false and the upgrade buttons disable.
 *
 * "Manage subscription" (customer portal) and richer plan display land at
 * TASK-068 per the roadmap split.
 */

const TIERS = [
  {
    key: "creator" as const,
    label: "Creator",
    price: "$12/mo",
    blurb: "25 posts a month across 4 platforms.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR ?? "",
  },
  {
    key: "pro" as const,
    label: "Pro",
    price: "$19/mo",
    blurb: "Unlimited posts across all 6 platforms.",
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO ?? "",
  },
];

function planLabel(
  status: string,
  tier?: "creator" | "pro",
): string {
  if (status === "active") return tier === "pro" ? "Pro" : "Creator";
  if (status === "trial") return "Trial";
  if (status === "expired") return "Expired";
  if (status === "canceled") return "Canceled";
  return status;
}

export function BillingPortal() {
  const { isSignedIn, user } = useUser();
  const searchParams = useSearchParams();
  const currentUser = useQuery(api.users.current);

  // Graceful-unavailable probe: run the init once on mount and surface the
  // honest result (false = no token / init failed).
  const [paddleReady, setPaddleReady] = useState<boolean | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    void initPaddle().then(setPaddleReady);
  }, [isSignedIn]);

  // Clerk v7 types primaryEmailAddress as string | EmailAddressResource.
  const email = (() => {
    const primary = user?.primaryEmailAddress;
    if (typeof primary === "string") return primary;
    if (primary && typeof primary === "object" && "emailAddress" in primary) {
      return primary.emailAddress;
    }
    return user?.emailAddresses?.[0]?.emailAddress;
  })();

  const upgraded = searchParams.get("upgraded") === "1";
  const currentTier =
    currentUser?.subscriptionStatus === "active"
      ? (currentUser.subscriptionTier ?? null)
      : null;

  async function handleUpgrade(tierKey: "creator" | "pro", priceId: string) {
    if (pending) return;
    setPending(tierKey);
    setNotice(null);
    try {
      const ok = await startCheckout({
        priceId,
        email,
        clerkUserId: user?.id,
      });
      if (!ok) {
        setNotice("Billing is unavailable right now — try again shortly.");
      }
    } catch {
      setNotice("Couldn't open checkout. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="billing-portal">
      {upgraded && (
        <p
          role="status"
          data-testid="billing-success"
          className="rounded-md border border-success/40 bg-success/10 px-4 py-3 font-sans text-[13px] leading-[1.5] text-success"
        >
          Payment complete. Your plan activates automatically in a few seconds
          once Paddle confirms it.
        </p>
      )}

      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Current plan
        </p>
        <p className="mt-1 font-sans text-[15px] font-medium text-on-surface" data-testid="billing-current-plan">
          {currentUser === undefined
            ? "…"
            : currentUser === null
              ? "Sign in to view"
              : planLabel(currentUser.subscriptionStatus, currentUser.subscriptionTier)}
        </p>
      </div>

      {notice && (
        <p role="alert" className="font-sans text-[13px] text-error">
          {notice}
        </p>
      )}

      {paddleReady === false && (
        <p className="rounded-md border border-warning/60 bg-warning/10 px-4 py-3 font-sans text-[13px] leading-[1.5] text-warning">
          Billing is not configured yet (missing client token). See
          docs/HANDOFF.md for the setup checklist.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TIERS.map((tier) => {
          const isCurrent = currentTier === tier.key;
          return (
            <div
              key={tier.key}
              data-testid={`billing-tier-${tier.key}`}
              className={`flex flex-col gap-3 rounded-lg border bg-surface p-6 ${
                tier.key === "pro" ? "border-border-strong" : "border-border"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-sans text-[17px] font-semibold text-on-surface">
                  {tier.label}
                </h2>
                <span className="font-mono text-[13px] text-on-surface-muted">
                  {tier.price}
                </span>
              </div>
              <p className="font-sans text-[13px] leading-[1.5] text-on-surface-muted">
                {tier.blurb}
              </p>
              <button
                type="button"
                disabled={isCurrent || pending !== null || paddleReady === false}
                data-testid={`billing-upgrade-${tier.key}`}
                onClick={() => handleUpgrade(tier.key, tier.priceId)}
                className="mt-auto inline-flex h-10 items-center justify-center rounded-md border-2 border-border-strong bg-surface-raised px-4 font-sans text-[13px] font-medium text-on-surface transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                {isCurrent
                  ? "Current plan"
                  : pending === tier.key
                    ? "Opening checkout…"
                    : `Upgrade to ${tier.label}`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="font-sans text-[12px] leading-[1.5] text-on-surface-muted">
        Payments are handled by Paddle (merchant of record). Need to manage an
        existing subscription? A customer portal link arrives with{" "}
        <Link href="/settings" className="underline">
          billing polish
        </Link>
        .
      </p>
    </div>
  );
}
