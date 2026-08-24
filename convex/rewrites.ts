"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";
import { PROMPTS, type Platform } from "../src/lib/ai/prompts";
import { generateWithOpenRouter } from "../src/lib/ai/openrouter";

/**
 * rewrites.generate — TASK-043 (PRD § 4 FR-005).
 *
 * Dev: all platforms via OpenRouter. Model is env-configurable:
 *   npx convex env set OPENROUTER_MODEL <model>   (optional; code default
 *   is src/lib/ai/openrouter.ts OPENROUTER_MODEL_DEFAULT).
 * Prod: swap provider by changing only src/lib/ai/openrouter.ts + env
 * (DeepSeek for 5, OpenAI gpt-4o-mini for YouTube title per PRD).
 *
 * Auth: asserts signed-in user can post (trial quota check lives here;
 * increment is on posts.ship). Retries up to 2× on timeout.
 */

const PLATFORM_UNION = v.union(
  v.literal("youtube"),
  v.literal("linkedin"),
  v.literal("x"),
  v.literal("threads"),
  v.literal("instagram"),
  v.literal("tiktok"),
);

function resolveApiKey(): string | null {
  // Prefer the single OpenRouter key; fall back to legacy names for compat.
  return env.OPENROUTER_API_KEY ?? env.DEEPSEEK_API_KEY ?? env.OPENAI_API_KEY ?? null;
}

function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|ETIMEDOUT|AbortError/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTimeoutError(err) || i === attempts) throw err;
      // brief backoff before retry
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

async function generateForPlatform(
  masterDescription: string,
  platform: Platform,
  apiKey: string,
  model: string | undefined,
): Promise<string> {
  const prompt = PROMPTS[platform];
  const raw = await withRetry(() =>
    generateWithOpenRouter(apiKey, {
      system: prompt.system,
      user: prompt.buildUser(masterDescription),
      model,
    }),
  );
  return raw;
}

export const generate = action({
  args: {
    masterDescription: v.string(),
    platforms: v.optional(v.array(PLATFORM_UNION)),
  },
  returns: v.object({
    youtube: v.object({
      title: v.string(),
      description: v.string(),
      tags: v.array(v.string()),
    }),
    linkedin: v.string(),
    x: v.string(),
    threads: v.string(),
    instagram: v.string(),
    tiktok: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    const user = await ctx.runQuery(internal.users.getByClerkId, {
      clerkUserId: identity.subject,
    });
    if (user === null) {
      throw new Error("Not authenticated");
    }
    // Trial/paid gate lives with posts.ship in v1; generate itself only
    // requires sign-in. A future assertUserCanPost() check can be added
    // here when rate-limit/trial-post enforcement moves earlier.

    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new Error(
        "AI not configured: set OPENROUTER_API_KEY (or legacy DEEPSEEK/OPENAI keys) via `npx convex env set` and in .env.local",
      );
    }
    // Optional model override; undefined → code default in openrouter.ts.
    const model = env.OPENROUTER_MODEL ?? undefined;

    const requested = (args.platforms as Platform[] | undefined) ?? [
      "youtube",
      "linkedin",
      "x",
      "threads",
      "instagram",
      "tiktok",
    ];

    // YouTube is JSON-structured; others are plain strings.
    const youtubeRaw = requested.includes("youtube")
      ? await generateForPlatform(args.masterDescription, "youtube", apiKey, model)
      : "";

    // Parallel for the other five (or fewer if platforms subset).
    const otherPlatforms = requested.filter((p) => p !== "youtube") as Exclude<
      Platform,
      "youtube"
    >[];
    const otherResults = await Promise.all(
      otherPlatforms.map(
        async (p) =>
          [p, await generateForPlatform(args.masterDescription, p, apiKey, model)] as const,
      ),
    );
    const otherMap = Object.fromEntries(otherResults) as Record<string, string>;

    // Parse YouTube JSON; fall back to raw split if model ignored JSON.
    let youtube: { title: string; description: string; tags: string[] } = {
      title: "",
      description: youtubeRaw,
      tags: [],
    };
    if (youtubeRaw) {
      try {
        const parsed = JSON.parse(youtubeRaw);
        youtube = {
          title: String(parsed.title ?? "").slice(0, 100),
          description: String(parsed.description ?? youtubeRaw),
          tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
        };
      } catch {
        youtube = { title: youtubeRaw.slice(0, 60), description: youtubeRaw, tags: [] };
      }
    }

    return {
      youtube,
      linkedin: otherMap.linkedin ?? "",
      x: otherMap.x ?? "",
      threads: otherMap.threads ?? "",
      instagram: otherMap.instagram ?? "",
      tiktok: otherMap.tiktok ?? "",
    };
  },
});
