import Link from "next/link";

export const metadata = { title: "Settings" };

/**
 * /settings — index with section links. Billing joins in Phase 3 (TASK-068).
 */
export default function SettingsPage() {
  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Settings
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/settings/accounts"
            data-testid="settings-card-accounts"
            className="rounded-lg border border-border bg-surface p-6 transition-colors hover:border-border-strong"
          >
            <h2 className="font-sans text-[17px] font-semibold text-on-surface">
              Accounts
            </h2>
            <p className="mt-2 font-sans text-[13px] leading-[1.5] text-on-surface-muted">
              Connect or disconnect your publishing platforms via Post for Me.
            </p>
          </Link>
          <div
            aria-disabled
            className="rounded-lg border border-dashed border-border p-6 opacity-60"
          >
            <h2 className="font-sans text-[17px] font-semibold text-on-surface">
              Billing
            </h2>
            <p className="mt-2 font-sans text-[13px] leading-[1.5] text-on-surface-muted">
              Plan management arrives with Phase 3.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
