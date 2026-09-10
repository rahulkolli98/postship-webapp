"use client";

// posthog-js is a DYNAMIC import here — it must never join the initial
// bundle (TASK-076: 1550ms of unused JS was the first-run finding). This
// module is the ONLY client runtime import; server routes use
// src/lib/postHog.ts which never touches the SDK.
// (type-only import erased at build time — no runtime edge)
import type { PostHog } from "posthog-js";
import { PostHogProvider as PostHogJsProvider } from "posthog-js/react";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { usePathname, useSearchParams } from "next/navigation";
import {
  captureClientEvent,
  identifyClient,
  setPostHogClient,
} from "../lib/postHog";

/**
 * PostHog client provider — TASK-070/076.
 *
 * Env-driven no-op: without NEXT_PUBLIC_POSTHOG_KEY the children render
 * bare (same pattern as Paddle/Resend/AI keys). Analytics traffic goes
 * through the /ingest reverse proxy (next.config.ts) — the official
 * PostHog Next.js pattern.
 *
 * TASK-076: the module + init moved to a dynamic import so the analytics
 * SDK is never a LCP/TBT cost on the critical path; components capture via
 * the postHog.ts ref and simply no-op until the import resolves.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "/ingest";
const POSTHOG_UI_HOST = "https://us.posthog.com";

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      captureClientEvent("posthog_page_view", {
        path: pathname,
        search: searchParams?.toString() ?? "",
      });
    }
  }, [pathname, searchParams]);

  return null;
}

function PostHogIdentify() {
  const { user } = useUser();

  useEffect(() => {
    // Minimal props: id only, no email/PII into third-party infra.
    if (user?.id) identifyClient(user.id);
  }, [user]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  const [ph, setPh] = useState<PostHog | null>(null);

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    void import("posthog-js")
      .then(({ default: phg }) => {
        phg.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          ui_host: POSTHOG_UI_HOST,
          person_profiles: "identified_only",
        });
        setPostHogClient(phg);
        setPh(phg);
      })
      .catch((err: unknown) => {
        console.error("[posthog] dynamic init failed:", err);
      });
  }, []);

  if (!POSTHOG_KEY || !ph) {
    // Children mount normally while the SDK loads in the background —
    // no data, no blocked render.
    return <>{children}</>;
  }

  return (
    <PostHogJsProvider client={ph}>
      <PostHogIdentify />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PostHogJsProvider>
  );
}
