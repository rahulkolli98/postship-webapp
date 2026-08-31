"use client";

import {
  PLATFORMS,
  type Platform,
  type PublishResult,
} from "../../../src/lib/publishing/types";

/**
 * PublishProgress — TASK-054.
 *
 * Renders per-platform ship results returned by the posts.ship action.
 * v1 note: PFM posts asynchronously, so "uploading" is the immediate state;
 * final posted/failed arrives via webhooks (TASK-056), at which point this
 * component can be driven by a live query instead of the action response.
 */

const LABELS: Record<string, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  instagram: "Instagram",
  tiktok: "TikTok",
};

type ResultEntry = {
  status: string;
  url?: string;
  error?: string;
};

function StatusChip({ entry }: { entry: ResultEntry }) {
  if (entry.status === "posted") {
    return (
      <a
        href={entry.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="rounded-sm bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-success hover:underline"
      >
        Posted
      </a>
    );
  }
  if (entry.status === "failed") {
    return (
      <span className="rounded-sm bg-error/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-error">
        Failed
      </span>
    );
  }
  if (entry.status === "uploading") {
    return (
      <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface">
        Uploading
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-muted">
      {entry.status}
    </span>
  );
}

export function PublishProgress({
  results,
  onRetry,
  retrying,
}: {
  results: PublishResult;
  onRetry?: (platform: Platform) => void;
  retrying?: Platform | null;
}) {
  const entries = PLATFORMS.flatMap((p) => {
    const e = results[p];
    return e ? [[p, e] as const] : [];
  });
  if (entries.length === 0) return null;

  const anyFailed = entries.some(([, e]) => e.status === "failed");
  const allDone = entries.every(
    ([, e]) => e.status === "posted" || e.status === "failed",
  );

  return (
    <div data-testid="publish-progress" className="flex flex-col gap-2">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
        {allDone ? "Ship result" : "Shipping…"}
        {allDone && !anyFailed && entries.length > 0 ? " · all clear" : ""}
      </p>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-raised">
        {entries.map(([platform, entry]) => (
          <li
            key={platform}
            data-testid={`publish-${platform}`}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface">
              {LABELS[platform] ?? platform}
            </span>
            <span className="flex items-center gap-3">
              {entry.error ? (
                <span className="font-sans text-[12px] text-error">{entry.error}</span>
              ) : null}
              <StatusChip entry={entry} />
              {entry.status === "failed" && onRetry ? (
                <button
                  type="button"
                  onClick={() => onRetry(platform as Platform)}
                  disabled={retrying === platform}
                  data-testid={`retry-${platform}`}
                  className="rounded-sm border border-border-strong px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  {retrying === platform ? "Retrying…" : "Retry"}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
