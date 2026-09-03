"use client";

import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useAction, useQuery, useConvexAuth } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { initPaddle, startCheckout } from "../../lib/paddle";
import { planDisplay } from "../../lib/planDisplay";
import posthog from "posthog-js";
import { POSTHOG_EVENTS } from "../../lib/postHog";

/**
 * BillingPortal — TASK-062/068 (PRD FR-011, US-014/015/016).
 *
 * Two tier cards opening the Paddle overlay checkout (sandbox-first):
 *   - Price IDs from NEXT_PUBLIC_PADDLE_PRICE_* env (sandbox `pri_…` now,
 *     live IDs flip in at TASK-081).
 *   - Clerk email pre-fills the customer; customData.clerkUserId rides to
 *     the TASK-063 webhook for user resolution.
 *   - After payment Paddle redirects to /settings/billing?upgraded=1 →
 *     success banner. Convex state does NOT change from this screen — the
 *     webhook is the source of truth (063/064).
 *   - Graceful "billing unavailable" when the client token is absent.
 *
 * TASK-068: rich current-plan block via the shared planDisplay helper, and
 * "Manage subscription" → Paddle customer portal (convex/billing.ts creates
 * an authenticated session for the CALLER'S OWN paddleCustomerId; hidden
 * for users who never purchased).
 */

const TIERS = [
  {
    key: "creator" as const,
    label: "Creator",
    price: "$12/mo",
    blurb: "25 posts a month across all 6 platforms.",
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

export function BillingPortal() {
  const { isSignedIn, user } = useUser();
  const searchParams = useSearchParams();
  const convexAuth = useConvexAuth();
  const currentUser = useQuery(api.users.current);
  const createPortalSession = useAction(api.billing.createPortalSession);

  // Graceful-unavailable probe: run the init once on mount and surface the
  // honest result (false = no token / init failed).
  const [paddleReady, setPaddleReady] = useState<boolean | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [portalOpening, setPortalOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Mount-time snapshot (React Compiler purity — see planDisplay.ts).
  const [now] = useState(() => Date.now());

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

  // TASK-070: upgrade_completed fires once per ?upgraded=1 landing (the
  // webhook is the provisioning truth; this is just the funnel event).
  useEffect(() => {
    if (upgraded && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.capture(POSTHOG_EVENTS.UPGRADE_COMPLETED, {});
    }
  }, [upgraded]);

  const currentTier =
    currentUser?.subscriptionStatus === "active"
      ? (currentUser.subscriptionTier ?? "creator")
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

  async function handlePortal() {
    if (portalOpening) return;
    setPortalOpening(true);
    setNotice(null);
    try {
      const { url } = await createPortalSession({});
      if (url) {
        window.open(url, "_blank", "noopener");
      } else {
        setNotice("No billing account yet — upgrade first, then manage it here.");
      }
    } catch {
      setNotice("Couldn't open the billing portal. Try again.");
    } finally {
      setPortalOpening(false);
    }
  }

  const plan =
    currentUser === null || currentUser === undefined
      ? null
      : planDisplay(currentUser, {
          monthlyPostCount: undefined,
          now,
        });
  const hasPaddleAccount =
    typeof currentUser?.paddleCustomerId === "string" &&
    currentUser.paddleCustomerId.length > 0;

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

      <div className="rounded-lg border border-border bg-surface p-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Current plan
        </p>
        {convexAuth.isLoading || currentUser === undefined || plan === null ? (
          <div className="mt-2 space-y-2">
            <span className="inline-block h-6 w-32 animate-pulse rounded bg-muted" />
            <span className="inline-block h-4 w-48 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="mt-2">
            <p
              className="font-sans text-[22px] font-semibold text-on-surface"
              data-testid="billing-current-plan"
            >
              {plan.label}
            </p>
            <p className="mt-1 font-sans text-[13px] leading-[1.5] text-on-surface-muted">
              {plan.detail}
              {plan.note ? ` · ${plan.note}` : ""}
            </p>
            {hasPaddleAccount && (
              <button
                type="button"
                onClick={handlePortal}
                disabled={portalOpening}
                data-testid="billing-manage-subscription"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-md border-2 border-border-strong bg-surface-raised px-4 font-sans text-[13px] font-medium text-on-surface transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                {portalOpening ? "Opening portal…" : "Manage subscription"}
              </button>
            )}
          </div>
        )}
      </div>

      {notice && (
        <p role="alert" className="font-sans text-[13px] text-error">
          {notice}
        </p>
      )}

      {paddleReady === false && (
        <p className="rounded-md border border-warning/60 bg-warning/10 px-4 py-3 font-sans text-[13px] leading-[1.5] text-warning">
          Billing isn&apos;t available on this deployment — the Paddle client
          token wasn&apos;t included at build time. Check the deployment&apos;s
          build variables (see console for the exact signal).
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
        Payments are handled by Paddle (merchant of record). Subscription
        changes, invoices, and payment methods live in the Paddle customer
        portal.
      </p>
    </div>
  );
}
