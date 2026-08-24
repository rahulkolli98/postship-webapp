"use client";

import Link from "next/link";
import { useState } from "react";
import { Authenticated, AuthLoading, useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { TrialCounter } from "./TrialCounter";
import { VideoUploader } from "./VideoUploader";
import { MasterDescription } from "./MasterDescription";

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
  const generate = useAction(api.rewrites.generate);
  const [masterDescription, setMasterDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // Ephemeral until posts.create (TASK-049) persists drafts. A future `drafts`
  // table (noted in docs/project-context.md) will make this survive refresh.
  const [rewrites, setRewrites] = useState<null | {
    youtube: { title: string; description: string; tags: string[] };
    linkedin: string;
    x: string;
    threads: string;
    instagram: string;
    tiktok: string;
  }>(null);

  const connected = accounts ?? [];
  const hasConnections = connected.length > 0;

  async function handleGenerate() {
    if (masterDescription.length < 20) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generate({ masterDescription });
      setRewrites(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/AI not configured/i.test(msg)) {
        setGenerateError("AI not configured. Add OPENROUTER_API_KEY in webapp/.env.local and via `npx convex env set OPENROUTER_API_KEY ...`.");
      } else {
        setGenerateError("Couldn't generate. Try again.");
      }
    } finally {
      setGenerating(false);
    }
  }

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
        ) : (
          <div className="flex flex-col gap-10">
            {!hasConnections && (
              <p
                role="status"
                className="rounded-md border border-warning/60 bg-warning/10 px-4 py-3 font-sans text-[13px] leading-[1.5] text-warning"
              >
                Not connected yet — you can still upload and generate.{" "}
                <Link href="/settings/accounts" className="underline">
                  Connect platforms
                </Link>{" "}
                to ship.
              </p>
            )}
            <VideoUploader />
            <MasterDescription
              value={masterDescription}
              onChange={setMasterDescription}
              onGenerate={handleGenerate}
              generating={generating}
            />
            {generateError && (
              <p role="alert" className="font-sans text-[13px] text-error">
                {generateError}
              </p>
            )}
            {rewrites && <RewritesPreview rewrites={rewrites} />}
            {hasConnections ? (
              <ConnectedState connected={connected} />
            ) : (
              <ConnectPrompt />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div data-testid="composer-empty-state" className="rounded-lg border border-dashed border-border bg-surface-raised p-6">
      <p className="font-sans text-[14px] font-medium text-on-surface">
        Ready to ship? Connect your first platform.
      </p>
      <p className="mt-2 max-w-[560px] font-sans text-[13px] leading-[1.5] text-on-surface-muted">
        Postship publishes through Post for Me — one connection lights up all six networks.
      </p>
      <Link
        href="/settings/accounts"
        className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 font-sans text-sm font-medium text-primary-foreground transition-colors hover:bg-accent hover:text-on-accent"
      >
        Connect platforms
      </Link>
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
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
        Connected platforms
      </p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Connected platforms">
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

function RewritesPreview({
  rewrites,
}: {
  rewrites: {
    youtube: { title: string; description: string; tags: string[] };
    linkedin: string;
    x: string;
    threads: string;
    instagram: string;
    tiktok: string;
  };
}) {
  return (
    <div data-testid="rewrites-preview" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-border bg-surface-raised p-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-muted">
          YouTube
        </p>
        <p className="mt-2 font-sans text-[14px] font-medium text-on-surface">{rewrites.youtube.title}</p>
        <p className="mt-2 font-sans text-[13px] leading-[1.5] text-on-surface-muted">
          {rewrites.youtube.description}
        </p>
        {rewrites.youtube.tags.length > 0 && (
          <p className="mt-2 font-mono text-[11px] text-on-surface-subtle">
            {rewrites.youtube.tags.join(", ")}
          </p>
        )}
      </div>
      {(
        [
          ["linkedin", rewrites.linkedin],
          ["x", rewrites.x],
          ["threads", rewrites.threads],
          ["instagram", rewrites.instagram],
          ["tiktok", rewrites.tiktok],
        ] as const
      ).map(([platform, text]) => (
        <div key={platform} className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-muted">
            {PLATFORM_LABELS[platform] ?? platform}
          </p>
          <p className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-[1.5] text-on-surface">
            {text}
          </p>
        </div>
      ))}
    </div>
  );
}
