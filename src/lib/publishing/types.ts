/**
 * Publishing abstraction types — TASK-050 (PRD § 4).
 *
 * All composer/ship code depends on these types + the `publish` function in
 * ./index.ts — never on Post for Me directly. Swapping providers (Postiz,
 * direct APIs) means writing one new PublishingClient.
 */

export const PLATFORMS = [
  "youtube",
  "linkedin",
  "x",
  "threads",
  "instagram",
  "tiktok",
] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Six-platform caption set (mirrors posts.rewrites). */
export type CaptionSet = {
  youtube: { title: string; description: string; tags: string[] };
  linkedin: string;
  x: string;
  threads: string;
  instagram: string;
  tiktok: string;
};

/**
 * Media resolvable by the provider — signed URLs (Convex storage getUrl)
 * prepared by the ship action before publish() is called.
 */
export type MediaItem = {
  url: string;
  filename: string;
  aspectRatio?: string;
};

/** One publish destination: a connected social account at the provider. */
export type PublishTarget = {
  platform: Platform;
  /** Provider's connected-account id (Post for Me: `sa_…`). */
  socialAccountId: string;
};

export type PublishRequest = {
  masterDescription: string;
  captions: CaptionSet;
  media: MediaItem[];
  /** Which paired media goes to which platform (by media.url). */
  pairing: Record<Platform, string>;
  targets: PublishTarget[];
};

export type PlatformResultStatus =
  | "queued"
  | "uploading"
  | "posted"
  | "failed";

export type PlatformResult = {
  status: PlatformResultStatus;
  url?: string;
  error?: string;
  postedAt?: number;
};

export type PublishResult = Partial<Record<Platform, PlatformResult>>;

/** Contract every provider implementation fulfills. */
export interface PublishingClient {
  publish(req: PublishRequest): Promise<PublishResult>;
}
