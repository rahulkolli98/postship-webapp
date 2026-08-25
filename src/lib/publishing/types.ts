/**
 * Publishing abstraction types — TASK-050, aligned to Post for Me verified
 * contract (TASK-051b, source: vendor NestJS DTOs).
 *
 * All composer/ship code depends on these types + the `publish` gate in
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

/**
 * One publish destination: a connected social account at the provider.
 * Caption + media are resolved PER TARGET by the caller (ship action) —
 * they ride to PFM as account_configurations overrides.
 */
export type PublishTarget = {
  platform: Platform;
  /** Provider's connected-account id (Post for Me: `sa_…`). */
  socialAccountId: string;
  /** Final caption text for this platform (already platform-native). */
  caption: string;
  /** Media paired with THIS platform. */
  media: MediaItem[];
};

/** Native YouTube structured fields (PFM maps these to snippet.*). */
export type YoutubePublishConfig = {
  title: string;
  description: string;
  tags: string[];
};

export type PublishRequest = {
  /** Base/fallback caption; per-target captions ride on targets. */
  masterDescription: string;
  captions: CaptionSet;
  /** Union of all target media (deduped by the caller). */
  media: MediaItem[];
  targets: PublishTarget[];
  /** Structured YouTube fields (only when youtube ∈ targets). */
  youtube?: YoutubePublishConfig;
  /** Idempotency key — we pass posts._id so retries never double-bill. */
  externalId?: string;
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
