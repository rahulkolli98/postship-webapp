import { Suspense } from "react";
import { BillingPortal } from "@/components/settings/BillingPortal";

export const metadata = { title: "Billing" };

/**
 * /settings/billing — TASK-062 (minimal mount).
 *
 * BillingPortal reads ?upgraded=1 via useSearchParams → needs a Suspense
 * boundary for prerendering.
 *
 * TASK-068 enriches this page: richer current-plan display + "Manage
 * subscription" via the Paddle customer portal.
 */
export default function BillingPage() {
  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Billing
        </p>
        <Suspense fallback={null}>
          <BillingPortal />
        </Suspense>
      </div>
    </div>
  );
}
