"use client";

import posthog from "posthog-js";
import { PostHogProvider as PostHogJsProvider, usePostHog } from "posthog-js/react";
import { Suspense, useEffect, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * PostHog client provider — TASK-070.
 *
 * Env-driven no-op: without NEXT_PUBLIC_POSTHOG_KEY the children render
 * bare (same pattern as Paddle/Resend/AI keys). Analytics traffic goes
 * through the /ingest reverse proxy (next.config.ts rewrites) so
 * adblockers that block posthog.com don't eat the data — the official
 * PostHog Next.js pattern.
 *
 * Identity: identify(clerkUserId) once auth resolves — server-side events
 * (sign_up, trial_started, connect_platform from the CF routes) and client
 * events then attach to the same person. No email/PII into third-party
 * infra: identify passes the id only.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "/ingest";
const POSTHOG_UI_HOST = "https://us.posthog.com";

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname) {
      posthog?.capture("posthog_page_view", {
        path: pathname,
        search: searchParams?.toString() ?? "",
      });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}

function PostHogIdentify() {
  const { user } = useUser();
  const posthog = usePostHog();

  useEffect(() => {
    if (user?.id) posthog?.identify(user.id);
  }, [user, posthog]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined" && POSTHOG_KEY && !posthog.__loaded) {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        ui_host: POSTHOG_UI_HOST,
        person_profiles: "identified_only",
      });
    }
  }, []);

  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PostHogJsProvider client={posthog}>
      <PostHogIdentify />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PostHogJsProvider>
  );
}
