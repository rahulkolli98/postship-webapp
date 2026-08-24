"use client";

import Link from "next/link";
import { useState } from "react";
import { Authenticated, AuthLoading, useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { TrialCounter } from "./TrialCounter";
import { VideoUploader, type UploadedFile } from "./VideoUploader";
import { MasterDescription } from "./MasterDescription";
import { PlatformCard, YouTubeCard, type Platform, type VideoOption } from "./PlatformCard";

/**
 * Composer — TASK-023 (empty state) → TASK-045 (full wiring).
 *
 * The single-screen canvas per PRD § 8 / design3: cream substrate
 * (--color-surface). Upload → master description → Generate → six editable
 * PlatformCards with per-platform video pairing. Connection is only needed
 * to Ship; upload/generate work with zero platforms connected.
 */

type Rewrites = {
  youtube: { title: string; description: string; tags: string[] };
  linkedin: string;
  x: string;
  threads: string;
  instagram: string;
  tiktok: string;
};

const ALL_PLATFORMS = [
  "youtube",
  "linkedin",
  "x",
  "threads",
  "instagram",
  "tiktok",
] as const satisfies readonly Platform[];

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
  const [rewrites, setRewrites] = useState<Rewrites | null>(null);
  // Live mirror of VideoUploader state (TASK-045): feeds pairing dropdowns
  // and, later, posts.create.
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  // Per-platform selected video storageId.
  const [pairings, setPairings] = useState<Partial<Record<Platform, string>>>({});

  function handleFilesChange(next: UploadedFile[]) {
    setUploads(next);
    setPairings((prev) => {
      const valid = new Set(next.map((f) => String(f.storageId)));
      const cleaned: Partial<Record<Platform, string>> = {};
      for (const key of Object.keys(prev) as Platform[]) {
        const v = prev[key];
        if (v && valid.has(v)) cleaned[key] = v;
      }
      // Auto-pair the newest video everywhere when the first upload lands.
      if (next.length > 0 && Object.keys(cleaned).length === 0) {
        const first = String(next[next.length - 1].storageId);
        for (const p of ALL_PLATFORMS) cleaned[p] = first;
      }
      return cleaned;
    });
  }

  const videoOptions: VideoOption[] = uploads.map(({ storageId, filename }) => ({
    storageId,
    filename,
  }));

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
            <VideoUploader onFilesChange={handleFilesChange} />
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
            {rewrites && (
              <RewritesGrid
                rewrites={rewrites}
                videos={videoOptions}
                pairings={pairings}
                onPairingChange={(platform, id) =>
                  setPairings((prev) => ({ ...prev, [platform]: id }))
                }
                onChange={(patch) => setRewrites((prev) => (prev ? { ...prev, ...patch } : prev))}
              />
            )}
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

function RewritesGrid({
  rewrites,
  videos,
  pairings,
  onPairingChange,
  onChange,
}: {
  rewrites: Rewrites;
  videos: VideoOption[];
  pairings: Partial<Record<Platform, string>>;
  onPairingChange: (platform: Platform, storageId: string) => void;
  onChange: (patch: Partial<Rewrites>) => void;
}) {
  const others = ["linkedin", "x", "threads", "instagram", "tiktok"] as const;

  return (
    <div data-testid="rewrites-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <YouTubeCard
        value={rewrites.youtube}
        onChange={(yt) => onChange({ youtube: yt })}
        videos={videos}
        selectedVideoId={pairings.youtube}
        onVideoChange={(id) => onPairingChange("youtube", id)}
      />
      {others.map((p) => (
        <PlatformCard
          key={p}
          platform={p}
          value={rewrites[p]}
          onChange={(v) => onChange({ [p]: v } as Partial<Rewrites>)}
          videos={videos}
          selectedVideoId={pairings[p]}
          onVideoChange={(id) => onPairingChange(p, id)}
        />
      ))}
    </div>
  );
}
