/**
 * PostHog analytics — TASK-070 (PRD § 6 success metrics).
 *
 * This module is SERVER-SAFE: it must never import posthog-js (the client
 * SDK), because CF route handlers import it. Client-side init lives in
 * src/components/PostHogProvider.tsx; both sides read the same public
 * config (NEXT_PUBLIC_POSTHOG_KEY — the project key is public by design).
 *
 * Server capture uses the raw capture endpoint (plain fetch, no SDK):
 *   POST {host}/capture/  { api_key, event, distinct_id, properties }
 * Awaiting is intentional — Cloudflare workers kill un-awaited work after
 * the response, and these calls are single-digit ms.
 *
 * Events (roadmap TASK-070): sign-up, trial-start, connect-platform,
 * generate, ship, upgrade. Client + server share this event-name constant
 * so dashboards stay stable.
 *
 * Env-driven no-op: without NEXT_PUBLIC_POSTHOG_KEY every call is a silent
 * no-op (same pattern as Paddle/Resend/AI keys).
 */

const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const PROJECT_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

export const POSTHOG_EVENTS = {
  SIGN_UP: "sign_up",
  TRIAL_STARTED: "trial_started",
  CONNECT_PLATFORM: "connect_platform",
  GENERATE: "generate",
  POST_SHIPPED: "post_shipped",
  UPGRADE_COMPLETED: "upgrade_completed",
} as const;

export function isPostHogConfigured(): boolean {
  return PROJECT_KEY !== "";
}

export async function captureServerEvent(
  distinctId: string,
  event: string,
  props?: Record<string, unknown>,
): Promise<void> {
  if (!PROJECT_KEY || !distinctId) return;
  try {
    const res = await fetch(`${HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: PROJECT_KEY,
        event,
        distinct_id: distinctId,
        properties: { ...props, $lib: "postship-server" },
      }),
    });
    if (!res.ok) {
      console.error("[posthog] capture rejected:", res.status);
    }
  } catch (err) {
    console.error("[posthog] capture error:", err);
  }
}
