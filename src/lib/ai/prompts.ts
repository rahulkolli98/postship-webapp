/**
 * Per-platform prompt templates — TASK-042 (PRD FR-005).
 *
 * One entry per platform: system + user-template. Prompts tune for native
 * tone; YouTube splits into title/description/tags via the action.
 * Imported only by convex/rewrites.ts (server-only).
 */

export type Platform = "youtube" | "linkedin" | "x" | "threads" | "instagram" | "tiktok";

export type Prompt = { system: string; buildUser: (master: string) => string };

const YOUTUBE_SYSTEM =
  "You are a YouTube SEO specialist. Write titles that earn clicks without clickbait, descriptions that rank, and tags that match search intent. Keep titles under 60 chars. No emojis unless the master description uses them. No em dashes.";

const LINKEDIN_SYSTEM =
  "You are a LinkedIn thought-leadership writer. Write in a calm, professional, first-person narrative. No hype, no growth-hacking jargon. One clear takeaway. Keep it under 1300 characters. No em dashes.";

const X_SYSTEM =
  "You are an X (Twitter) copywriter. Punchy, under 280 characters including hashtags. One hook, one idea. 1–2 relevant hashtags max. No em dashes.";

const THREADS_SYSTEM =
  "You are a Threads writer. Short, conversational, lowercase-friendly where natural, line breaks welcome. Under 500 characters. No em dashes.";

const INSTAGRAM_SYSTEM =
  "You are an Instagram caption writer. Conversational, warm, 1–2 line hook then body. 3–8 relevant hashtags at the end on their own line. Under 2200 characters. No em dashes.";

const TIKTOK_SYSTEM =
  "You are a TikTok caption writer. Short, hook-forward, Gen-Z native but not cringey. Under 150 characters. 2–4 hashtags. No em dashes.";

export const PROMPTS: Record<Platform, Prompt> = {
  youtube: {
    system: YOUTUBE_SYSTEM,
    buildUser: (m) =>
      `Master description:\n${m}\n\nGenerate:\n1. title (under 60 chars)\n2. description (2–4 short paragraphs, SEO, include what the video covers)\n3. tags (8–12 comma-separated keywords)\n\nReturn as JSON: {"title":"...","description":"...","tags":["..."]}`,
  },
  linkedin: {
    system: LINKEDIN_SYSTEM,
    buildUser: (m) => `Master description:\n${m}\n\nRewrite it as a LinkedIn post.`,
  },
  x: {
    system: X_SYSTEM,
    buildUser: (m) => `Master description:\n${m}\n\nRewrite it as a single X post.`,
  },
  threads: {
    system: THREADS_SYSTEM,
    buildUser: (m) => `Master description:\n${m}\n\nRewrite it as a Threads post.`,
  },
  instagram: {
    system: INSTAGRAM_SYSTEM,
    buildUser: (m) => `Master description:\n${m}\n\nRewrite it as an Instagram caption.`,
  },
  tiktok: {
    system: TIKTOK_SYSTEM,
    buildUser: (m) => `Master description:\n${m}\n\nRewrite it as a TikTok caption.`,
  },
};
