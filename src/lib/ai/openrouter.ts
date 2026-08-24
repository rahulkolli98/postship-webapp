/**
 * OpenRouter client — single provider for all AI rewrites in dev.
 *
 * TASK-040/041 originally split DeepSeek + OpenAI; per founder direction
 * 2026-08-22 we use OpenRouter (`thinkingmachines/inkling:free`) for
 * everything in testing and can switch providers later without touching
 * prompt or action code.
 *
 * Convex actions import this via `src/lib/ai/openrouter.ts` and run with
 * `"use node";` (see convex/rewrites.ts). Keys are server-only:
 * set OPENROUTER_API_KEY via `npx convex env set` + `.env.local` for local
 * Next dev. The model name is the only thing that changes when we swap
 * providers later.
 */
import OpenAI from "openai";

export const OPENROUTER_MODEL = "thinkingmachines/inkling:free";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    // OpenRouter recommends these headers for ranking/discovery; optional
    defaultHeaders: {
      "HTTP-Referer": "https://postship.app",
      "X-Title": "Postship",
    },
  });
}

/**
 * Thin helper: single chat completion. Retries are handled by the caller
 * (convex/rewrites.ts does up to 2× on timeout).
 */
export async function generateWithOpenRouter(
  apiKey: string,
  opts: { system: string; user: string },
): Promise<string> {
  const client = createOpenRouterClient(apiKey);
  const res = await client.chat.completions.create({
    model: OPENROUTER_MODEL,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: 0.7,
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}
