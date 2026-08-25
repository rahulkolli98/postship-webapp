import type {
  CaptionSet,
  Platform,
  PublishRequest,
  PublishingClient,
} from "./types";

/**
 * Platform-native caption text for one publish target. YouTube folds
 * title/description/tags into a single block (provider-side field mapping
 * for title/tags is verified before live shipping — see postforme.ts TODO).
 */
export function captionFor(platform: Platform, captions: CaptionSet): string {
  if (platform === "youtube") {
    const tags = captions.youtube.tags
      .map((t) => `#${t.replace(/\s+/g, "")}`)
      .join(" ");
    return [
      captions.youtube.title,
      captions.youtube.description,
      tags,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return captions[platform];
}

/**
 * Publishing abstraction — TASK-050 (PRD § 4).
 *
 * The ONLY entry point ship code uses. Provider implementations live behind
 * the PublishingClient interface; swapping Post for Me → Postiz → direct
 * APIs touches zero call sites.
 *
 * Validation here is structural (targets exist, pairings reference attached
 * media). Business rules — trial quota, connected-account checks — belong
 * to the calling action (TASK-052), not the transport layer.
 */
export async function publish(
  client: PublishingClient,
  req: PublishRequest,
): Promise<ReturnType<PublishingClient["publish"]>> {
  if (req.targets.length === 0) {
    throw new Error("No publish targets: connect a platform first.");
  }

  const mediaUrls = new Set(req.media.map((m) => m.url));
  const platforms = new Set(req.targets.map((t) => t.platform));
  if (platforms.size !== req.targets.length) {
    throw new Error("Duplicate platform in publish targets.");
  }

  for (const t of req.targets) {
    const pairedUrl = req.pairing[t.platform];
    if (!pairedUrl || !mediaUrls.has(pairedUrl)) {
      throw new Error(
        `Pairing for ${t.platform} does not reference attached media.`,
      );
    }
  }

  return client.publish(req);
}
