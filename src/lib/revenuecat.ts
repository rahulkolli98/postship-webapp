import { Purchases } from "@revenuecat/purchases-js";

/**
 * RevenueCat Web Billing init — TASK-061 (PRD FR-011).
 *
 * Contract verified from official docs (revenuecat.com configure-SDK guide +
 * Web SDK quickstart, 2026-08-31):
 *   - `Purchases.configure({ apiKey, appUserId })` is called EXACTLY once
 *     per browser session; later access goes through
 *     `Purchases.getSharedInstance()`.
 *   - The key is the Web Billing PUBLIC key (`rcb_…`, sandbox `rcb_sb_…`) —
 *     public by design, so `NEXT_PUBLIC_` inlining is safe (naming rule #12:
 *     anything NEXT_PUBLIC_ is public; secrets never carry that prefix).
 *   - The Web SDK does NOT mint anonymous ids — the signed-in Clerk user id
 *     is passed as appUserId. This maps 1:1 to `users.clerkUserId`, which
 *     the TASK-063 webhook and TASK-064 state mapping resolve against.
 *
 * Env-driven no-op: without NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY the app
 * runs untouched (same pattern as OPENROUTER_API_KEY / POSTFORME_API_KEY).
 * Sandbox-first (founder-approved): start with the rcb_sb_ key + Stripe test
 * mode; production key flips in at launch (TASK-081).
 */

// Inlined at build time by Next.js (client bundle).
const PUBLIC_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY ?? "";

let configured = false;

/** Whether the SDK is configured in this browser session. */
export function isRevenueCatConfigured(): boolean {
  return configured;
}

/**
 * Configure the Web SDK once for this session. Safe to call repeatedly;
 * only the first call with a non-empty key and a signed-in user configures.
 * Returns whether configuration succeeded (false = unconfigured or failed).
 */
export function initRevenueCat(appUserId: string): boolean {
  if (configured) return true;
  if (!PUBLIC_API_KEY || !appUserId) return false;
  if (typeof window === "undefined") return false; // client-only SDK

  try {
    Purchases.configure({ apiKey: PUBLIC_API_KEY, appUserId });
    configured = true;
    return true;
  } catch (err) {
    // Configuration failure must never break the app — billing UI degrades
    // to "unavailable" via isRevenueCatConfigured() in TASK-062.
    console.error("[revenuecat] configure failed:", err);
    return false;
  }
}
