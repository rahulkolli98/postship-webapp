"use client";

import Link from "next/link";
import { Authenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { TrialCounter } from "./TrialCounter";

/**
 * Composer — TASK-023 (empty state).
 *
 * The single-screen canvas per PRD § 8 / design3: cream substrate
 * (--color-surface), display headline, and until at least one platform is
 * connected, a "Connect platforms" CTA pointing at Settings → Accounts
 * (the real Post for Me OAuth flow is TASK-053).
 */

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export function Composer() {
  return (
    <div className="p-4 md:p-8">
      <Authenticated>
        <ComposerCanvas />
      </Authenticated>
      <AuthLoading>
        <Skeleton />
      </AuthLoading>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-4 rounded-lg border border-border bg-surface-raised p-10">
      <div className="h-5 w-40 rounded bg-muted" />
      <div className="h-12 w-2/3 rounded bg-muted" />
      <div className="h-24 w-full rounded bg-muted" />
    </div>
  );
}

function ComposerCanvas() {
  const accounts = useQuery(api.accounts.list);
  const connected = accounts ?? [];
  const hasConnections = connected.length > 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Composer
        </p>
        <TrialCounter />
      </div>

      {/* Canvas — design3 composer substrate */}
      <section className="rounded-lg border border-border bg-surface p-8 md:p-12">
        {accounts === undefined ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 w-1/2 rounded bg-border/60" />
            <div className="h-4 w-3/4 rounded bg-border/60" />
          </div>
        ) : hasConnections ? (
          <ConnectedState connected={connected} />
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div data-testid="composer-empty-state">
      <h1 className="font-newsreader text-4xl font-medium leading-[1.05] tracking-[-0.025em] text-on-surface md:text-[56px]">
        Connect your first platform.
      </h1>
      <p className="mt-4 max-w-[560px] font-sans text-[15px] leading-[1.55] text-on-surface-muted">
        Postship publishes through Post for Me. One connection lights up all
        six networks, so you can write one description and ship it everywhere.
      </p>
      <Link
        href="/settings/accounts"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 font-sans text-sm font-medium text-primary-foreground transition-colors hover:bg-accent hover:text-on-accent"
      >
        Connect platforms
      </Link>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle">
        YouTube · LinkedIn · X · Threads · Instagram · TikTok
      </p>
    </div>
  );
}

function ConnectedState({
  connected,
}: {
  connected: Array<{ _id: string; platform: string; platformDisplayName?: string }>;
}) {
  return (
    <div data-testid="composer-connected">
      <h1 className="font-newsreader text-4xl font-medium leading-[1.05] tracking-[-0.025em] text-on-surface md:text-[56px]">
        Drop your videos. Write it once.
      </h1>
      <p className="mt-4 max-w-[560px] font-sans text-[15px] leading-[1.55] text-on-surface-muted">
        The upload and caption flow ships in Phase 2. Your connected platforms
        are ready for it.
      </p>
      <ul className="mt-8 flex flex-wrap gap-2" aria-label="Connected platforms">
        {connected.map((a) => (
          <li
            key={a._id}
            className="rounded-md border border-border bg-surface-raised px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface"
          >
            {PLATFORM_LABELS[a.platform] ?? a.platform}
            {a.platformDisplayName ? (
              <span className="ml-2 text-on-surface-muted">{a.platformDisplayName}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
