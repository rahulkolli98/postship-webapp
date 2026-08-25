import type {
  PublishRequest,
  PublishResult,
  PublishingClient,
} from "./types";
import { captionFor } from "./index";

/**
 * Post for Me client — TASK-051 (v1 publishing backend).
 *
 * Verified contract (postforme.dev homepage, 2026-08-24):
 *   POST {base}/social-posts
 *   Authorization: Bearer <api-key>
 *   { caption: string, social_accounts: ["sa_…"], media: [{ url }] }
 *   → { id }   (posting is async; final status arrives via webhooks)
 *
 * One call PER target — PFM takes a single caption per request, and our
 * whole product is per-platform captions. Results start at "uploading";
 * the webhook handler (TASK-056) moves them to posted/failed.
 *
 * TODO(before live shipping): confirm against api.postforme.dev/docs —
 * (a) YouTube title/tags as dedicated fields vs folded into caption,
 * (b) error response shape, (c) status-polling endpoint if webhooks lag.
 */

const DEFAULT_BASE_URL = "https://api.postforme.dev";

export function createPostForMeClient(
  apiKey: string,
  baseUrl: string = DEFAULT_BASE_URL,
): PublishingClient {
  return {
    async publish(req: PublishRequest): Promise<PublishResult> {
      const results: PublishResult = await Promise.all(
        req.targets.map(async (target) => {
          const pairedMedia = req.media.filter(
            (m) => m.url === req.pairing[target.platform],
          );
          try {
            const res = await fetch(`${baseUrl}/social-posts`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                caption: captionFor(target.platform, req.captions),
                social_accounts: [target.socialAccountId],
                media: pairedMedia.map((m) => ({ url: m.url })),
              }),
            });

            if (!res.ok) {
              // Deliberately generic — provider body may contain anything.
              return [
                target.platform,
                {
                  status: "failed" as const,
                  error: `Post for Me error ${res.status}`,
                },
              ] as const;
            }

            const data = (await res.json().catch(() => ({}))) as {
              id?: string;
              url?: string;
            };
            return [
              target.platform,
              {
                status: "uploading" as const,
                ...(data?.url ? { url: data.url } : {}),
              },
            ] as const;
          } catch (err) {
            return [
              target.platform,
              {
                status: "failed" as const,
                error: err instanceof Error ? err.message : String(err),
              },
            ] as const;
          }
        }),
      ).then((entries) => Object.fromEntries(entries) as PublishResult);

      return results;
    },
  };
}
