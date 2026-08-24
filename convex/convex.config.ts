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
  },
});
