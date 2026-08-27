"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * PostHistory — TASK-059 (PRD FR-009 / US-012).
 *
 * Two sections: Shipped (last 50, expandable rows with full rewrites +
 * result URLs) and Drafts (resumable — Resume bumps savedAt so the
 * composer adopts it; Discard deletes). Design3 language: cream canvas,
 * mono labels, hairline dividers, status chips in PublishProgress colors.
 */

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  instagram: "Instagram",
  tiktok: "TikTok",
};

type ResultEntry = { status: string; url?: string; error?: string };
type ResultsMap = Record<string, ResultEntry | undefined>;

const STATUS_CHIP: Record<string, string> = {
  posted: "bg-success/10 text-success",
  uploading: "bg-accent-soft text-on-surface",
  failed: "bg-error/10 text-error",
  queued: "bg-muted text-on-surface-muted",
};

function StatusChip({ entry }: { entry: ResultEntry | undefined }) {
  if (!entry) {
    return (
      <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-subtle">
        —
      </span>
    );
  }
  const cls = STATUS_CHIP[entry.status] ?? "bg-muted text-on-surface-muted";
  return (
    <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${cls}`}>
      {entry.status}
    </span>
  );
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

export function PostHistory() {
  const shipped = useQuery(api.posts.list);
  const drafts = useQuery(api.posts.listDrafts);
  const resumeDraft = useMutation(api.posts.resumeDraft);
  const discardDraftMutation = useMutation(api.posts.discardDraft);
  const [expandedId, setExpandedId] = useState<Id<"posts"> | null>(null);

  const loading = shipped === undefined || drafts === undefined;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      {/* ── Drafts ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Drafts
        </p>
        {loading ? (
          <Skeleton />
        ) : (drafts ?? []).length === 0 ? (
          <p className="font-sans text-[13px] leading-[1.5] text-on-surface-subtle">
            No drafts. Save one from the composer and it lands here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-raised" data-testid="draft-list">
            {(drafts ?? []).map((d) => (
              <li key={d._id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid="draft-row">
                <div className="min-w-0">
                  <p className="truncate font-sans text-[14px] text-on-surface">
                    {truncate(d.masterDescription, 90) || "Untitled draft"}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle">
                    Saved {fmtDate(d.savedAt ?? d.createdAt)}
                    {(d.platforms ?? []).length > 0
                      ? ` · ${(d.platforms ?? []).length} platform${(d.platforms ?? []).length === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    data-testid={`resume-draft`}
                    onClick={() => void resumeDraft({ draftId: d._id })}
                    className="inline-flex h-8 items-center justify-center rounded-md border-2 border-border-strong bg-surface-raised px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    aria-label="Discard draft"
                    onClick={() => void discardDraftMutation({ draftId: d._id })}
                    className="inline-flex h-8 items-center rounded-md px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle transition-colors hover:bg-error/10 hover:text-error"
                  >
                    Discard
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Shipped ────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          Shipped
        </p>
        {loading ? (
          <Skeleton />
        ) : (shipped ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-raised p-8 text-center">
            <p className="font-sans text-[14px] font-medium text-on-surface">
              Nothing shipped yet.
            </p>
            <p className="mx-auto mt-2 max-w-[420px] font-sans text-[13px] leading-[1.5] text-on-surface-muted">
              Your posted videos and their results show up here.
            </p>
            <Link
              href="/compose"
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 font-sans text-sm font-medium text-primary-foreground transition-colors hover:bg-accent hover:text-on-accent"
            >
              Compose one
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-raised" data-testid="shipped-list">
            {(shipped ?? []).map((post) => {
              const expanded = expandedId === post._id;
              const results = post.platformResults;
              return (
                <li key={post._id} data-testid="shipped-row">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : post._id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-sans text-[14px] text-on-surface">
                        {truncate(post.masterDescription, 90) || "(no description)"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle">
                        {fmtDate(post.publishedAt ?? post.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {(post.platforms ?? []).map((p) => (
                        <StatusChip key={p} entry={results[p as keyof typeof results]} />
                      ))}
                      <span className="ml-1 font-mono text-[11px] text-on-surface-subtle">
                        {expanded ? "−" : "+"}
                      </span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-border bg-surface px-4 py-4" data-testid="shipped-expanded">
                      <CaptionBlock
                        title="Master description"
                        text={post.masterDescription}
                      />
                      <CaptionBlock
                        title="YouTube"
                        title2={post.rewrites.youtube.title}
                        text={post.rewrites.youtube.description}
                        tags={post.rewrites.youtube.tags}
                      />
                      {(
                        [
                          ["linkedin", post.rewrites.linkedin],
                          ["x", post.rewrites.x],
                          ["threads", post.rewrites.threads],
                          ["instagram", post.rewrites.instagram],
                          ["tiktok", post.rewrites.tiktok],
                        ] as const
                      ).map(([p, text]) => (
                        <CaptionBlock key={p} title={PLATFORM_LABELS[p] ?? p} text={text} />
                      ))}

                      {/* Posted URLs */}
                      {Object.entries(results).some(([, e]) => e?.url) && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {Object.entries(results)
                            .filter(([, e]) => e?.url)
                            .map(([p, e]) => (
                              <a
                                key={p}
                                href={e!.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface transition-colors hover:border-border-strong"
                              >
                                {PLATFORM_LABELS[p] ?? p} ↗
                              </a>
                            ))}
                        </div>
                      )}
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

function CaptionBlock({
  title,
  title2,
  text,
  tags,
}: {
  title: string;
  title2?: string;
  text?: string;
  tags?: string[];
}) {
  if (!title2 && !text && (!tags || tags.length === 0)) return null;
  return (
    <div className="mb-4 last:mb-0">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-muted">
        {title}
      </p>
      {title2 ? (
        <p className="mt-1 font-sans text-[14px] font-medium text-on-surface">{title2}</p>
      ) : null}
      {text ? (
        <p className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-[1.5] text-on-surface-muted">
          {text}
        </p>
      ) : null}
      {tags && tags.length > 0 ? (
        <p className="mt-1 font-mono text-[11px] text-on-surface-subtle">{tags.join(", ")}</p>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-lg border border-border bg-surface-raised p-6">
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="h-4 w-1/2 rounded bg-muted" />
    </div>
  );
}
