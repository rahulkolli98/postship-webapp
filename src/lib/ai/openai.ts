/**
 * OpenAI client — TASK-041 (YouTube title fallback in PRD).
 *
 * Roadmap expects this file; in dev we delegate to OpenRouter's
 * thinkingmachines/inkling:free.
 */
import { generateWithOpenRouter } from "./openrouter";

export async function generateWithOpenAI(
  apiKey: string,
  opts: { system: string; user: string },
): Promise<string> {
  return generateWithOpenRouter(apiKey, opts);
}
