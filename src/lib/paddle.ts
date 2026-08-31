import { initializePaddle, type Paddle } from "@paddle/paddle-js";

/**
 * Paddle Billing init — TASK-061 (PRD § 10, Paddle deviation 2026-08-31).
 *
 * Contract verified from official sources (developer.paddle.com +
 * PaddleHQ/paddle-agent-skills, 2026-08-31):
 *   - `initializePaddle({ token, environment })` is ASYNC and returns
 *     Promise<Paddle | undefined>. It resolves with the shared instance;
 *     callers must not touch Checkout before it resolves.
 *   - The client-side token is PUBLIC by design (`test_…` sandbox /
 *     `live_…` production) → NEXT_PUBLIC_ inlining is safe (naming rule:
 *     anything NEXT_PUBLIC_ is public; secrets never carry that prefix).
 *   - Tokens, prices, and domains are ENVIRONMENT-SCOPED — sandbox `pri_…`
 *     IDs do not exist in production. NEXT_PUBLIC_PADDLE_ENV must match
 *     the token's environment; defaults to "sandbox" (safe fallback).
 *   - Unlike RevenueCat's web SDK, Paddle does NOT force an appUserId —
 *     customers are keyed by email/customData. TASK-062 passes the Clerk
 *     email + customData.clerkUserId at Checkout.open time.
 *
 * Env-driven no-op: without NEXT_PUBLIC_PADDLE_CLIENT_TOKEN the app runs
 * untouched (same pattern as OPENROUTER_API_KEY / POSTFORME_API_KEY).
 * Sandbox-first (founder decision 2026-08-31); the production token flips
 * in at launch (TASK-081).
 */

// Inlined at build time by Next.js (client bundle).
const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";

function resolveEnvironment(): "sandbox" | "production" {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
    ? "production"
    : "sandbox";
}

// Shared promise = double-init guard. initializePaddle is async, so a
// plain boolean flag could race two concurrent initPaddle() calls.
let initPromise: Promise<boolean> | null = null;
let paddleInstance: Paddle | null = null;

/** Whether the SDK finished initializing in this browser session. */
export function isPaddleConfigured(): boolean {
  return paddleInstance !== null;
}

/** Shared Paddle instance, or null before init resolves. TASK-062 consumes. */
export function getPaddle(): Paddle | null {
  return paddleInstance;
}

/**
 * Initialize Paddle.js once per session. Safe to call repeatedly; later
 * calls await the same shared attempt. Resolves false when unconfigured
 * (no token / non-browser) or when initialization failed — it never throws
 * into the caller.
 */
export function initPaddle(): Promise<boolean> {
  if (paddleInstance !== null) return Promise.resolve(true);
  if (initPromise) return initPromise;
  if (!CLIENT_TOKEN || typeof window === "undefined") {
    return Promise.resolve(false);
  }

  const environment = resolveEnvironment();
  initPromise = initializePaddle({ token: CLIENT_TOKEN, environment })
    .then((instance) => {
      if (!instance) {
        console.error(
          "[paddle] initializePaddle resolved empty — check the client token and NEXT_PUBLIC_PADDLE_ENV",
        );
        return false;
      }
      paddleInstance = instance;
      // Founder live-verification hook (TASK-061 check).
      console.info(`[paddle] initialized (${environment})`);
      return true;
    })
    .catch((err: unknown) => {
      console.error("[paddle] initialize failed:", err);
      initPromise = null; // allow a later attempt to retry
      return false;
    });
  return initPromise;
}
