import { AuthConfig } from "convex/server";

/**
 * Convex auth providers — TASK-020/021 (PRD § 9).
 *
 * Validates Clerk-issued JWTs so `ctx.auth.getUserIdentity()` works inside
 * Convex functions. Without this file every identity lookup returns null.
 *
 * - domain = the Clerk Frontend API URL (issuer). Resolved by the CONVEX
 *   BACKEND, so set it with `npx convex env set CLERK_JWT_ISSUER_DOMAIN ...`
 *   per deployment (local dev + later prod) — NOT just in .env.local.
 * - applicationID must be "convex": it matches the aud claim of tokens minted
 *   by Clerk's built-in Convex integration (Dashboard → apps/setup/convex).
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
