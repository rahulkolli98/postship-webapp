"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Post history — TASK-059 (PRD FR-009 / US-012).
 *
 * Two sections: Drafts (resumable via composer's auto-load) and Shipped
 * (collapsible rows: truncated description → full captions + posted URLs).
 * Status chips reuse the PublishProgress color language.
 */

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  instagram: "Instagram",
  tiktok: "TikTok",
};

const PLATFORM_ORDER = ["youtube", "linkedin", "x", "threads", "instagram", "tiktok"] as const;

type ResultEntry = { status: string; url?: string; error?: string };

type HistoryEntry = {
  _id: Id<"posts">;
  _creationTime: number;
  masterDescription: string;
  platforms?: string[];
  status?: "draft";
  publishedAt?: number;
  platformResults: Record<string, ResultEntry | undefined>;
  rewrites: {
    youtube: { title: string; description: string; tags: string[] };
    linkedin: string;
    x: string;
    threads: string;
    instagram: string;
    tiktok: string;
  };
};

function StatusDots({ results, platforms }: { results: Record<string, ResultEntry | undefined>; platforms?: string[] }) {
  const keys = (platforms?.length ? platforms : PLATFORM_ORDER) as string[];
  return (
    <span className="flex items-center gap-1" aria-label="Platform statuses">
      {keys.map((p) => {
        const e = results[p];
        const status = e?.status ?? (platforms?.includes(p) ? "queued" : "skipped");
        const color =
          status === "posted"
            ? "bg-success"
            : status === "uploading"
              ? "bg-warning"
              : status === "failed"
                ? "bg-error"
                : "bg-border";
        const title = `${PLATFORM_LABELS[p] ?? p}: ${status}`;
        return <span key={p} title={title} className={`size-2 rounded-full ${color}`} />;
      })}
    </span>
  );
}

function captionFor(entry: HistoryEntry, platform: string): string {
  if (platform === "youtube") {
    const yt = entry.rewrites.youtube;
    return [yt.title, yt.description, yt.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")]
      .filter(Boolean)
      .join("\n\n");
  }
  if (platform === "linkedin") return entry.rewrites.linkedin;
  if (platform === "x") return entry.rewrites.x;
  if (platform === "threads") return entry.rewrites.threads;
  if (platform === "instagram") return entry.rewrites.instagram;
  return entry.rewrites.tiktok;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PostHistory() {
  const history = useQuery(api.posts.listHistory);
  const discardDraft = useMutation(api.posts.discardDraft);
  const [expanded, setExpanded] = useState<Id<"posts"> | null>(null);
  const [discarding, setDiscarding] = useState<Id<"posts"> | null>(null);

  const loading = history === undefined;
  const shipped = history?.shipped ?? [];
  const drafts = history?.drafts ?? [];

  function handleDiscard(id: Id<"posts">) {
    setDiscarding(id);
    void discardDraft({ draftId: id }).finally(() => setDiscarding(null));
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 rounded-lg border border-border bg-surface-raised p-10">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="h-16 w-full rounded bg-muted" />
        <div className="h-16 w-full rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Drafts */}
      {drafts.length > 0 && (
        <section className="rounded-lg border border-dashed border-border bg-surface p-6" data-testid="history-drafts">
          <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
            Drafts
          </p>
          <ul className="flex flex-col gap-3">
            {drafts.map((d) => (
              <li
                key={d._id}
                data-testid="history-draft-row"
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-sans text-[14px] text-on-surface">
                    {d.masterDescription || "(no description)"}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle">
                    Saved {fmtDate(d._creationTime)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDiscard(d._id)}
                  disabled={discarding === d._id}
                  className="shrink-0 rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle hover:bg-error/10 hover:text-error disabled:opacity-50"
                >
                  {discarding === d._id ? "…" : "Discard"}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle">
            The latest draft auto-loads in the composer.
          </p>
        </section>
      )}

      {/* Shipped */}
      <section className="rounded-lg border border-border bg-surface p-6" data-testid="history-shipped">
        <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Shipped
        </p>

        {shipped.length === 0 ? (
          <div className="py-6">
            <p className="font-sans text-[15px] text-on-surface">Nothing shipped yet.</p>
            <p className="mt-2 font-sans text-[13px] text-on-surface-muted">
              Your posts appear here the moment you ship.{" "}
              <Link href="/compose" className="underline">
                Compose one
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {shipped.map((entry) => {
              const isOpen = expanded === entry._id;
              const postedUrls = PLATFORM_ORDER.map((p) => ({
                platform: p,
                result: entry.platformResults[p],
              })).filter(({ result }) => result?.status === "posted" && result.url);

              return (
                <li key={entry._id} data-testid="history-row" className="py-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry._id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-sans text-[14px] text-on-surface">
                        {entry.masterDescription || "(no description)"}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle">
                        {fmtDate(entry.publishedAt ?? entry._creationTime)}
                      </span>
                    </span>
                    <StatusDots results={entry.platformResults} platforms={entry.platforms} />
                    <span className="shrink-0 font-mono text-[11px] text-on-surface-subtle">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 flex flex-col gap-3 border-l-2 border-accent pl-4" data-testid="history-expanded">
                      {/* Full captions per platform */}
                      {PLATFORM_ORDER.filter((p) => captionFor(entry, p).trim().length > 0).map((p) => (
                        <div key={p}>
                          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-on-surface-muted">
                            {PLATFORM_LABELS[p]}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-[1.5] text-on-surface">
                            {captionFor(entry, p)}
                          </p>
                        </div>
                      ))}

                      {/* Posted URLs */}
                      {postedUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {postedUrls.map(({ platform, result }) => (
                            <a
                              key={platform}
                              href={result!.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-border bg-surface-raised px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface hover:border-accent"
                            >
                              {PLATFORM_LABELS[platform]} ↗
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Per-platform errors */}
                      {PLATFORM_ORDER.filter((p) => entry.platformResults[p]?.status === "failed").map((p) => (
                        <p key={p} className="font-sans text-[12px] text-error">
                          {PLATFORM_LABELS[p]}: {entry.platformResults[p]?.error ?? "failed"}
                        </p>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
