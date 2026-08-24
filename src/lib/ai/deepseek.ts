/**
 * DeepSeek client — TASK-040.
 *
 * Roadmap expects this file; in dev we delegate to the single OpenRouter
 * client (thinkingmachines/inkling:free) so no DEEPSEEK_API_KEY is needed.
 * Swap `createOpenRouterClient` for a DeepSeek-direct client later by
 * changing only this file + env.
 */
import { generateWithOpenRouter } from "./openrouter";

export async function generateWithDeepSeek(
  apiKey: string,
  opts: { system: string; user: string },
): Promise<string> {
  return generateWithOpenRouter(apiKey, opts);
}
