import type {
  PublishRequest,
  PublishResult,
  PublishingClient,
} from "./types";

/**
 * Post for Me client — TASK-051 + 051b (v1 publishing backend).
 *
 * Contract VERIFIED against vendor source (NestJS DTOs, repo
 * DayMoonDevelopment/post-for-me, api/src/social-posts/dto/*):
 *   POST {base}/social-posts        Authorization: Bearer <key>
 *   {
 *     caption,                      // base caption (required)
 *     social_accounts: ["sa_…"],    // required
 *     media: [{ url }],             // shared media set
 *     platform_configurations: { youtube: { title, description, tags } },
 *     account_configurations: [     // per-account overrides
 *       { social_account_id, configuration: { caption?, media? } }
 *     ],
 *     external_id,                  // idempotency — we send posts._id
 *     scheduled_at: null            // null → post instantly
 *   }
 *   → SocialPostDto { id, status: draft|scheduled|processing|processed, … }
 *
 * ONE call covers all targets: each account gets its own caption/media via
 * account_configurations; YouTube gets native structured fields via
 * platform_configurations. Posting is ASYNC — results start at "uploading"
 * and finalize via webhooks/status polling (TASK-056).
 */

const DEFAULT_BASE_URL = "https://api.postforme.dev/v1";

export function createPostForMeClient(
  apiKey: string,
  baseUrl: string = DEFAULT_BASE_URL,
): PublishingClient {
  return {
    async publish(req: PublishRequest): Promise<PublishResult> {
      const body: Record<string, unknown> = {
        caption:
          req.masterDescription ||
          req.targets.find((t) => t.caption)?.caption ||
          "",
        social_accounts: req.targets.map((t) => t.socialAccountId),
        media: dedupeByUrl(req.media).map((m) => ({ url: m.url })),
        external_id: req.externalId ?? null,
        scheduled_at: null,
      };

      if (req.youtube && req.targets.some((t) => t.platform === "youtube")) {
        body.platform_configurations = {
          youtube: {
            title: req.youtube.title,
            description: req.youtube.description,
            tags: req.youtube.tags,
          },
        };
      }

      const accountConfigurations = req.targets
        .filter((t) => t.caption.trim().length > 0 || t.media.length > 0)
        .map((t) => ({
          social_account_id: t.socialAccountId,
          configuration: {
            ...(t.caption.trim() ? { caption: t.caption } : {}),
            ...(t.media.length > 0
              ? { media: t.media.map((m) => ({ url: m.url })) }
              : {}),
          },
        }));
      if (accountConfigurations.length > 0) {
        body.account_configurations = accountConfigurations;
      }

      try {
        const res = await fetch(`${baseUrl}/social-posts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          // PFM 400s carry { message, errors: [...] } — surface the REAL
          // reason (e.g. "invalid social accounts, not owned by user").
          const bodyText = await res.text().catch(() => "");
          let detail = `Post for Me error ${res.status}`;
          try {
            const j = JSON.parse(bodyText) as {
              message?: string;
              errors?: string[];
            };
            if (Array.isArray(j?.errors) && j.errors.length > 0) {
              detail = `Post for Me: ${j.errors.join("; ")}`;
            } else if (j?.message) {
              detail = `Post for Me: ${j.message}`;
            }
          } catch {
            /* body wasn't JSON — keep generic */
          }
          console.error("[pfm] create rejected:", res.status, bodyText.slice(0, 500));
          return failAll(req, detail);
        }

        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          url?: string;
          status?: string;
        };

        // PFM processes asynchronously: map its processing/scheduled states
        // to our "uploading"; final posted/failed arrives via TASK-056.
        const uploading =
          data.status === undefined ||
          data.status === "processing" ||
          data.status === "scheduled";

        return Object.fromEntries(
          req.targets.map((t) => [
            t.platform,
            uploading
              ? { status: "uploading" as const }
              : { status: "failed" as const, error: `Unexpected PFM status: ${data.status}` },
          ]),
        ) as PublishResult;
      } catch (err) {
        return failAll(
          req,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  };
}

function failAll(req: PublishRequest, error: string): PublishResult {
  return Object.fromEntries(
    req.targets.map((t) => [t.platform, { status: "failed" as const, error }]),
  ) as PublishResult;
}

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) =>
    seen.has(i.url) ? false : (seen.add(i.url), true),
  );
}
