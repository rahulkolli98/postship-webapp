"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Authenticated,
  AuthLoading,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TrialCounter } from "./TrialCounter";
import { VideoUploader, type UploadedFile } from "./VideoUploader";
import { MasterDescription } from "./MasterDescription";
import { PlatformCard, YouTubeCard, type Platform, type VideoOption } from "./PlatformCard";
import { ShipButton } from "./ShipButton";
import { PublishProgress } from "./PublishProgress";
import { computeDefaultPairings, type Orientation } from "../../lib/aspectRatio";
import type { PublishResult } from "../../../src/lib/publishing/types";

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

const EMPTY_REWRITES: Rewrites = {
  youtube: { title: "", description: "", tags: [] },
  linkedin: "",
  x: "",
  threads: "",
  instagram: "",
  tiktok: "",
};

/**
 * TASK-048: overwrite only the requested platforms' slices. The action
 * returns "" for non-requested platforms — a naive spread would wipe cards.
 */
function mergeRewrites(
  prev: Rewrites,
  fresh: Rewrites,
  platforms: Platform[],
): Rewrites {
  const next = { ...prev };
  for (const p of platforms) {
    // Handle youtube separately so TS can correlate key→value types.
    if (p === "youtube") next.youtube = fresh.youtube;
    else next[p] = fresh[p];
  }
  return next;
}

/**
 * TASK-046 pairing preferences. Founder call (2026-08-23): Threads prefers
 * PORTRAIT when both orientations exist; everything else follows PRD
 * FR-007 defaults (YouTube/LinkedIn/X landscape-first, IG/TikTok portrait).
 */
const PAIRING_PREFS: Record<Platform, Orientation> = {
  youtube: "landscape",
  linkedin: "landscape",
  x: "landscape",
  threads: "portrait",
  instagram: "portrait",
  tiktok: "portrait",
};

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
  const createPost = useMutation(api.posts.create);
  const updateDraft = useMutation(api.posts.updateDraft);
  const discardDraftMutation = useMutation(api.posts.discardDraft);
  const shipPost = useAction(api.posts.ship);
  const [masterDescription, setMasterDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // TASK-056b: the loaded draft row (null = fresh composition).
  const draft = useQuery(api.posts.latestDraft);
  const [draftId, setDraftId] = useState<Id<"posts"> | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [draftFiles, setDraftFiles] = useState<UploadedFile[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftBanner, setDraftBanner] = useState<string | null>(null);
  const [rewrites, setRewrites] = useState<Rewrites | null>(null);
  // Live mirror of VideoUploader state (TASK-045): feeds pairing dropdowns
  // and, later, posts.create.
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  // Per-platform selected video storageId.
  const [pairings, setPairings] = useState<Partial<Record<Platform, string>>>({});
  // Platforms the user manually changed (TASK-046): auto-defaults never
  // overwrite these until their video is removed.
  const [overrides, setOverrides] = useState<Set<Platform>>(new Set());
  // TASK-048: platforms with a regenerate call in flight (per-card spinner).
  const [regenerating, setRegenerating] = useState<Set<Platform>>(new Set());
  // TASK-054: ship pipeline state.
  const [shipping, setShipping] = useState(false);
  const [shipError, setShipError] = useState<{ text: string; connect?: boolean; upgrade?: boolean } | null>(null);
  const [shipResults, setShipResults] = useState<PublishResult | null>(null);
  // TASK-056b: hydrated draft videos → passed into VideoUploader once.
  const hydratedRef = useRef(false);
  // TASK-045b: founder-selected ship targets. TASK-054b: default to
  // CONNECTED platforms only (accounts query lands async → hydrate once).
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
  const selectionHydrated = useRef(false);

  function togglePlatform(platform: Platform) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        if (next.size === 1) return prev; // never allow zero selection
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }

  function handleFilesChange(next: UploadedFile[]) {
    const validIds = new Set(next.map((f) => String(f.storageId)));

    // Keep pairings whose video still exists; forget overrides for removed ones.
    const keptPairings: Partial<Record<Platform, string>> = {};
    const keptOverrides = new Set<Platform>();
    for (const p of ALL_PLATFORMS) {
      const v = pairings[p];
      if (v && validIds.has(v)) {
        keptPairings[p] = v;
        if (overrides.has(p)) keptOverrides.add(p);
      }
    }

    // TASK-046 defaults — applied only where the user hasn't overridden.
    const defaults =
      next.length > 0 ? computeDefaultPairings(next, PAIRING_PREFS) : {};
    for (const p of ALL_PLATFORMS) {
      if (!keptOverrides.has(p)) {
        const d = defaults[p];
        if (d) keptPairings[p] = d;
      }
    }

    setUploads(next);
    setPairings(keptPairings);
    setOverrides(keptOverrides);
  }

  const videoOptions: VideoOption[] = uploads.map(
    ({ storageId, filename }) => ({
      storageId,
      filename,
    }),
  );

  // ── TASK-056b: draft hydration ───────────────────────────────────────
  const draftVideoIds = (draft?.videos ?? []).map((v) => v.storageId);
  const draftUrls = useQuery(
    api.uploads.getUrls,
    hydrated || draftVideoIds.length === 0 ? "skip" : { ids: draftVideoIds },
  );

  useEffect(() => {
    if (hydrated || draft === undefined) return;
    hydratedRef.current = true;
    setHydrated(true);

    if (draft === null) return;
    setDraftId(draft._id);
    setMasterDescription(draft.masterDescription);
    setRewrites(draft.rewrites);
    setSelected(new Set((draft.platforms ?? []) as Platform[]));
    setPairings(draft.pairings);
    setDraftBanner(
      `Draft restored · saved ${new Date(draft._creationTime).toLocaleString()}`,
    );

    // Videos hydrate in a second pass (signed URLs are a separate query).
    if (draft.videos.length === 0) {
      setDraftFiles([]);
      return;
    }
  }, [draft, hydrated]);

  useEffect(() => {
    if (hydrated || !draft || draftUrls === undefined) return;
    if (draft.videos.length === 0) {
      setDraftFiles([]);
      return;
    }
    const files: UploadedFile[] = draft.videos.map((v, i) => ({
      storageId: v.storageId,
      filename: v.filename,
      blobUrl: draftUrls[i] ?? "",
      aspectRatio: v.aspectRatio as UploadedFile["aspectRatio"],
      durationSeconds: v.durationSeconds,
    }));
    setDraftFiles(files);
  }, [draft, draftUrls, hydrated]);

  function handleDiscard() {
    if (draftId) void discardDraftMutation({ draftId });
    setDraftId(null);
    setDraftBanner(null);
    setMasterDescription("");
    setRewrites(null);
    setUploads([]);
    setPairings({});
    setOverrides(new Set());
    setShipResults(null);
    selectionHydrated.current = false;
    setDraftFiles(null);
  }

  async function handleSave() {
    setSaveState("saving");
    try {
      const resolvedPairings = Object.fromEntries(
        ALL_PLATFORMS.map((p) => [
          p,
          pairings[p] ?? String(uploads[0]?.storageId ?? ""),
        ]),
      ) as Record<Platform, string>;
      const videos = uploads.map(
        ({ storageId, filename, durationSeconds, aspectRatio }) => ({
          storageId,
          filename,
          durationSeconds,
          aspectRatio,
        }),
      );
      const fields = {
        masterDescription,
        videos,
        rewrites: rewrites ?? EMPTY_REWRITES,
        pairings: resolvedPairings,
        platforms: [...selected],
      };
      if (draftId) {
        await updateDraft({ draftId, fields });
      } else {
        const id = await createPost({ ...fields, isDraft: true });
        setDraftId(id);
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      console.error("[draft] save failed:", err);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 4000);
    }
  }

  async function handleGenerate() {
    if (masterDescription.length < 20 || selected.size === 0) return;
    const platforms = [...selected];
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generate({
        masterDescription,
        platforms,
        mode: "generate",
      });
      // TASK-045b: overwrites all SELECTED cards (hinted on the button);
      // deselected cards keep whatever they had.
      setRewrites((prev) => (prev ? mergeRewrites(prev, result, platforms) : result));
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

  async function handleRegenerate(platform: Platform) {
    // Single-flight in v1; unlimited regens by policy (Option A).
    if (!rewrites || generating || regenerating.size > 0) return;
    setRegenerating((prev) => new Set(prev).add(platform));
    setGenerateError(null);
    try {
      // Uses the CURRENT master description — that's the point of "fix this one".
      const fresh = await generate({
        masterDescription,
        platforms: [platform],
        mode: "regenerate",
      });
      // Selective merge: fresh has "" for non-requested platforms — a naive
      // spread would wipe the other five cards.
      setRewrites((prev) => (prev ? mergeRewrites(prev, fresh, [platform]) : prev));
    } catch {
      setGenerateError(
        `Couldn't regenerate ${PLATFORM_LABELS[platform]}. Try again.`,
      );
    } finally {
      setRegenerating((prev) => {
        const next = new Set(prev);
        next.delete(platform);
        return next;
      });
    }
  }

  const connected = accounts ?? [];
  const hasConnections = connected.length > 0;

  // Hydrate selection once accounts load: default to connected platforms.
  if (accounts !== undefined && !selectionHydrated.current) {
    selectionHydrated.current = true;
    if (hasConnections) {
      setSelected(new Set(connected.map((a) => a.platform as Platform)));
    }
  }

  // ── TASK-054: ship pipeline ──────────────────────────────────────────
  // Content readiness: video + selection + at least one non-empty caption
  // among SELECTED platforms (YouTube counts via title/description).
  function captionFilled(p: Platform): boolean {
    if (!rewrites) return false;
    if (p === "youtube") {
      return (
        rewrites.youtube.title.trim().length > 0 ||
        rewrites.youtube.description.trim().length > 0
      );
    }
    return (rewrites[p] ?? "").trim().length > 0;
  }

  const filledSelected = [...selected].filter(captionFilled);
  const canShip =
    uploads.length > 0 && selected.size > 0 && filledSelected.length > 0 && !shipping;

  async function handleShip() {
    if (!canShip || uploads.length === 0) return;

    setShipping(true);
    setShipError(null);
    try {
      const platforms = [...selected];

      // Effective pairings: manual choice, else first upload fallback.
      const resolvedPairings = Object.fromEntries(
        ALL_PLATFORMS.map((p) => [
          p,
          pairings[p] ?? String(uploads[0]?.storageId ?? ""),
        ]),
      ) as Record<Platform, string>;

      const videos = uploads.map(
        ({ storageId, filename, durationSeconds, aspectRatio }) => ({
          storageId,
          filename,
          durationSeconds,
          aspectRatio,
        }),
      );

      // TASK-056b: a loaded draft is PROMOTED (refreshed + unmarked) rather
      // than duplicated; fresh compositions create a new row.
      let postId: Id<"posts">;
      const fields = {
        masterDescription,
        videos,
        rewrites: rewrites ?? EMPTY_REWRITES,
        pairings: resolvedPairings,
        platforms,
      };
      if (draftId) {
        await updateDraft({ draftId, fields, promote: true });
        postId = draftId;
        setDraftId(null);
        setDraftBanner(null);
      } else {
        postId = await createPost(fields);
      }

      const res = await shipPost({ postId });
      setShipResults(res.results);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      let parsed: { message?: string; code?: string } | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* plain error string */
      }

      const code = parsed?.code ?? "";
      const text = parsed?.message ?? "";

      if (/Not authenticated/i.test(raw)) {
        setShipError({ text: "Session expired. Refresh and sign in again." });
      } else if (code === "NO_CONNECTIONS") {
        setShipError({ text: text || "No platforms connected.", connect: true });
      } else if (code === "TRIAL_EXPIRED" || code === "TRIAL_EXHAUSTED" || code === "UPGRADE_REQUIRED") {
        setShipError({ text: text || "Upgrade to keep publishing.", upgrade: true });
      } else if (/PUBLISHING_NOT_CONFIGURED/i.test(raw)) {
        setShipError({ text: "Publishing backend not configured. Set POSTFORME_API_KEY (see docs/HANDOFF.md)." });
      } else if (/MEDIA_MISSING/i.test(raw)) {
        setShipError({ text: text || "A stored video went missing. Re-upload and try again." });
      } else if (text) {
        setShipError({ text });
      } else {
        setShipError({ text: "Couldn't ship. Try again." });
      }
    } finally {
      setShipping(false);
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

            {/* TASK-045b: platform selection chips */}
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
                Post to
              </p>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORMS.map((p) => {
                  const active = selected.has(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={active}
                      data-testid={`select-${p}`}
                      onClick={() => togglePlatform(p)}
                      className={`rounded-md border px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${
                        active
                          ? "border-accent bg-accent-soft/60 text-on-surface"
                          : "border-border bg-surface-raised text-on-surface-muted hover:border-border-strong hover:text-on-surface"
                      }`}
                    >
                      {PLATFORM_LABELS[p]}
                    </button>
                  );
                })}
              </div>
            </div>

            {draftBanner && (
              <p
                role="status"
                data-testid="draft-restored-banner"
                className="flex items-center justify-between rounded-md border border-border bg-surface-raised px-4 py-3 font-sans text-[13px] leading-[1.5] text-on-surface-muted"
              >
                <span>{draftBanner}</span>
                <button
                  type="button"
                  onClick={handleDiscard}
                  data-testid="discard-draft"
                  className="underline transition-colors hover:text-error"
                >
                  Discard draft
                </button>
              </p>
            )}
            <VideoUploader
              onFilesChange={handleFilesChange}
              hydrateFrom={draftFiles ?? undefined}
            />
            <MasterDescription
              value={masterDescription}
              onChange={setMasterDescription}
              onGenerate={handleGenerate}
              generating={generating}
              generateHint="Rewrites all selected captions"
            />
            {generateError && (
              <p role="alert" className="font-sans text-[13px] text-error">
                {generateError}
              </p>
            )}
            {/* TASK-045b: cards render for SELECTED platforms even before
                Generate — manual writers get their fields immediately. */}
            <RewritesGrid
              values={rewrites}
              platforms={[...selected]}
              videos={videoOptions}
              pairings={pairings}
              onPairingChange={(platform, id) => {
                setPairings((prev) => ({ ...prev, [platform]: id }));
                setOverrides((prev) => new Set(prev).add(platform));
              }}
              onChange={(patch) =>
                setRewrites((prev) => ({ ...(prev ?? EMPTY_REWRITES), ...patch }))
              }
              onRegenerate={handleRegenerate}
              regenerating={regenerating}
            />

            {/* TASK-054: ship pipeline */}
            {/* TASK-056b: Save draft + Ship row */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === "saving" || shipping}
                data-testid="save-draft-button"
                className="inline-flex h-12 items-center justify-center rounded-md border-2 border-border-strong bg-surface-raised px-5 font-sans text-sm font-medium text-on-surface transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "saved"
                    ? "Saved ✓"
                    : saveState === "error"
                      ? "Save failed"
                      : "Save draft"}
              </button>
              <div className="flex-1">
                <ShipButton disabled={!canShip} shipping={shipping} onClick={handleShip} />
              </div>
            </div>
            {shipError && (
              <p role="alert" className="rounded-md border border-error/40 bg-error/10 px-4 py-3 font-sans text-[13px] leading-[1.5] text-error">
                {shipError.text}{" "}
                {shipError.connect && (
                  <Link href="/settings/accounts" className="underline">
                    Connect platforms
                  </Link>
                )}
                {shipError.upgrade && (
                  <span className="text-on-surface-muted">
                    {" "}Billing arrives with Phase 3 — your drafts are safe.
                  </span>
                )}
              </p>
            )}
            {shipResults && <PublishProgress results={shipResults} />}

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
  values,
  platforms,
  videos,
  pairings,
  onPairingChange,
  onChange,
  onRegenerate,
  regenerating,
}: {
  /** Current caption values — may be EMPTY_REWRITES before first generate. */
  values: Rewrites | null;
  platforms: Platform[];
  videos: VideoOption[];
  pairings: Partial<Record<Platform, string>>;
  onPairingChange: (platform: Platform, storageId: string) => void;
  onChange: (patch: Partial<Rewrites>) => void;
  onRegenerate: (platform: Platform) => void;
  regenerating: Set<Platform>;
}) {
  // YouTube first, then the rest in canonical order, filtered to selection.
  const ordered = (["youtube", "linkedin", "x", "threads", "instagram", "tiktok"] as const).filter(
    (p) => platforms.includes(p),
  );

  return (
    <div data-testid="rewrites-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {ordered.map((p) =>
        p === "youtube" ? (
          <YouTubeCard
            key="youtube"
            value={values?.youtube ?? { title: "", description: "", tags: [] }}
            onChange={(yt) => onChange({ youtube: yt })}
            videos={videos}
            selectedVideoId={pairings.youtube}
            onVideoChange={(id) => onPairingChange("youtube", id)}
            onRegenerate={() => onRegenerate("youtube")}
            regenerating={regenerating.has("youtube")}
          />
        ) : (
          <PlatformCard
            key={p}
            platform={p}
            value={values?.[p] ?? ""}
            onChange={(v) => onChange({ [p]: v } as Partial<Rewrites>)}
            videos={videos}
            selectedVideoId={pairings[p]}
            onVideoChange={(id) => onPairingChange(p, id)}
            onRegenerate={() => onRegenerate(p)}
            regenerating={regenerating.has(p)}
          />
        ),
      )}
    </div>
  );
}
