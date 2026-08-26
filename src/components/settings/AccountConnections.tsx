"use client";

import { useEffect, useState } from "react";
import { Authenticated, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Account connections panel — TASK-026/053.
 *
 * Per-platform connect links hit our OAuth start route
 * (/api/oauth/postforme/start?platform=…) which redirects into PFM's hosted
 * consent for that ONE network (vendor reality — consent is per platform).
 * The callback syncs sa_ ids back into Convex accounts.
 *
 * TASK-027 owns the disconnect (×) flow here.
 */

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  instagram: "Instagram",
  tiktok: "TikTok",
};

const ALL_PLATFORMS = ["youtube", "linkedin", "x", "threads", "instagram", "tiktok"] as const;

const PARAM_MESSAGES: Record<string, string> = {
  "postforme-not-configured":
    "Publishing isn't configured yet. Set POSTFORME_API_KEY and reload.",
  "sync-failed": "We connected you on Post for Me but couldn't sync it just now. Try again in a minute.",
  "pfm-auth-url-404":
    "Post for Me doesn't have this platform enabled for your project yet — enable it in Project Setup on their dashboard, then retry.",
  "pfm-auth-url-400": "Post for Me rejected the connection request for this platform.",
  "pfm-no-url": "Post for Me didn't return a consent link. Try again, or check their dashboard.",
  "pfm-start-failed": "Couldn't reach Post for Me. Check your connection and retry.",
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
  const disconnectPlatform = useMutation(api.accounts.disconnect);
  const [pending, setPending] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const loading = accounts === undefined;
  const connected = accounts ?? [];
  const connectedPlatforms = new Set(connected.map((a) => a.platform));
  const missing = ALL_PLATFORMS.filter((p) => !connectedPlatforms.has(p));
  const hasConnections = connected.length > 0;

  // Read ?connected=N / ?error=… once on mount (set by the OAuth callback).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get("connected");
    if (n !== null && n !== "0") {
      setBanner(`Connected ${n} new platform${n === "1" ? "" : "s"} via Post for Me.`);
    } else if (n === "0") {
      setBanner("No new platforms were connected on that pass.");
    }
    const err = params.get("error");
    if (err) {
      setBanner(
        PARAM_MESSAGES[err] ??
          "Something went wrong connecting that platform. Try again.",
      );
    }
  }, []);

  function handleDisconnect(platform: string) {
    void disconnectPlatform({
      platform: platform as
        | "youtube"
        | "linkedin"
        | "x"
        | "threads"
        | "instagram"
        | "tiktok",
    });
    setPending(null);
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
              Nothing connected yet. Pick a network below to run its one-time
              Post for Me consent.
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
                    className="flex items-center gap-1 rounded-md border border-border bg-surface-raised px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface"
                  >
                    {PLATFORM_LABELS[a.platform] ?? a.platform}
                    {a.platformDisplayName ? (
                      <span className="text-on-surface-muted">
                        {a.platformDisplayName}
                      </span>
                    ) : null}
                    <AlertDialog
                      open={pending === a.platform}
                      onOpenChange={(o: boolean) => setPending(o ? a.platform : null)}
                    >
                      <AlertDialogTrigger>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Disconnect ${PLATFORM_LABELS[a.platform] ?? a.platform}`}
                          data-testid={`disconnect-${a.platform}`}
                          className="ml-1 inline-flex cursor-pointer rounded-sm px-1 text-on-surface-subtle transition-colors hover:bg-error/10 hover:text-error"
                        >
                          ×
                        </span>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Disconnect {PLATFORM_LABELS[a.platform] ?? a.platform}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Postship will stop publishing to this platform. You
                            can reconnect anytime, and your drafts are not
                            deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDisconnect(a.platform)}
                            className="bg-destructive text-white hover:bg-destructive/90"
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-8 flex flex-col gap-4">
            {/* Per-network consent (vendor reality): one link per missing
                platform, each opening PFM's hosted auth for that network. */}
            {missing.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
                  Connect a network
                </p>
                <div className="flex flex-wrap gap-2" data-testid="connect-platforms">
                  {missing.map((p) => (
                    <a
                      key={p}
                      href={`/api/oauth/postforme/start?platform=${p}`}
                      data-testid={`connect-${p}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border-2 border-border-strong bg-surface-raised px-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      Connect {PLATFORM_LABELS[p]}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {banner && (
              <p
                role="status"
                className="max-w-[560px] rounded-md border border-border bg-surface-raised px-4 py-3 font-sans text-[13px] leading-[1.5] text-on-surface-muted"
              >
                {banner}
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
