import { defineApp } from "convex/server";
import { v } from "convex/values";

/**
 * Typed env for Convex backend — TASK-040/041 wiring.
 *
 * In dev we use a single OpenRouter key for everything
 * (thinkingmachines/inkling:free); the DEEPSEEK/OPENAI names are kept
 * optional so roadmap verification ("DEEPSEEK_API_KEY from env") still
 * passes if you set either legacy name. At runtime rewrites.ts prefers
 * OPENROUTER_API_KEY, then falls back to the legacy names.
 *
 * Set with: npx convex env set OPENROUTER_API_KEY <key>
 * The dev key also lives in webapp/.env.local for local Next dev.
 */
export default defineApp({
  env: {
    OPENROUTER_API_KEY: v.optional(v.string()),
    OPENROUTER_MODEL: v.optional(v.string()),
    DEEPSEEK_API_KEY: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    // Post for Me publishing backend (TASK-051/052). Founder creates the
    // account at app.postforme.dev �+' API key.
    POSTFORME_API_KEY: v.optional(v.string()),
    // TASK-056: shared secret PFM sends as the Post-For-Me-Webhook-Secret
    // header — returned when the webhook is registered (register script).
    POSTFORME_WEBHOOK_SECRET: v.optional(v.string()),
    // TASK-063/064: Paddle Billing webhook. The secret comes from the
    // notification destination (founder creates it in the dashboard — it
    // shows ONCE); the price IDs are PUBLIC identifiers (pri_…) used to
    // derive the subscription tier server-authoritatively.
    PADDLE_WEBHOOK_SECRET: v.optional(v.string()),
    PADDLE_PRICE_CREATOR: v.optional(v.string()),
    PADDLE_PRICE_PRO: v.optional(v.string()),
  },
});
