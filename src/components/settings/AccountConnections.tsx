"use client";

import { useState } from "react";
import { Authenticated, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Account connections panel — TASK-026 (PRD § 8 Screen: Settings - Accounts).
 *
 * Shows connection status per platform and the single "Connect via
 * Post for Me" entry point (never six separate buttons).
 *
 * TASK-027 adds per-platform Disconnect here. TASK-053 (Phase 2) replaces
 * the placeholder onClick with the real Post for Me hosted-OAuth redirect
 * (/api/oauth/postforme/start); until then clicking explains the state
 * instead of 404ing.
 */

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export function AccountConnections() {
  return (
    <Authenticated>
      <Panel />
    </Authenticated>
  );
}

function Panel() {
  const accounts = useQuery(api.accounts.list);
  const [notice, setNotice] = useState(false);

  const loading = accounts === undefined;
  const connected = accounts ?? [];
  const hasConnections = connected.length > 0;

  function handleConnect() {
    // TODO(TASK-053): window.location.href = "/api/oauth/postforme/start"
    setNotice(true);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Settings · Accounts
        </p>
      </div>

      {loading ? (
        <Skeleton />
      ) : (
        <section className="rounded-lg border border-border bg-surface p-8 md:p-10">
          <h1 className="font-newsreader text-3xl font-medium leading-[1.05] tracking-[-0.02em] text-on-surface md:text-[40px]">
            Connected platforms.
          </h1>

          {!hasConnections ? (
            <p className="mt-4 max-w-[560px] font-sans text-[15px] leading-[1.55] text-on-surface-muted">
              Nothing connected yet. One Post for Me connection lights up all
              six networks at once.
            </p>
          ) : (
            <>
              <p className="mt-4 max-w-[560px] font-sans text-[15px] leading-[1.55] text-on-surface-muted">
                Connected via Post for Me. Publishing uses these on every ship.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Connected platforms">
                {connected.map((a) => (
                  <li
                    key={a._id}
                    className="rounded-md border border-border bg-surface-raised px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface"
                  >
                    {PLATFORM_LABELS[a.platform] ?? a.platform}
                    {a.platformDisplayName ? (
                      <span className="ml-2 text-on-surface-muted">
                        {a.platformDisplayName}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-8 flex flex-col gap-3">
            {/* Single entry point — PRD FR-002, never per-platform buttons */}
            <button
              type="button"
              onClick={handleConnect}
              data-testid="connect-platforms"
              className="inline-flex h-11 w-fit items-center justify-center rounded-md bg-primary px-6 font-sans text-sm font-medium text-primary-foreground transition-colors hover:bg-accent hover:text-on-accent"
            >
              Connect via Post for Me
            </button>

            {notice && (
              <p
                role="status"
                className="max-w-[560px] rounded-md border border-border bg-surface-raised px-4 py-3 font-sans text-[13px] leading-[1.5] text-on-surface-muted"
              >
                Heads up: the live connection flow ships in Phase 2. Your
                composer and workspace are ready for it.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4 rounded-lg border border-border bg-surface-raised p-10">
      <div className="h-8 w-64 rounded bg-muted" />
      <div className="h-4 w-full max-w-md rounded bg-muted" />
      <div className="h-11 w-56 rounded bg-muted" />
    </div>
  );
}
