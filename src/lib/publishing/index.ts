import type {
  PublishRequest,
  PublishingClient,
} from "./types";

/**
 * Publishing gate — TASK-050 (PRD § 4).
 *
 * The ONLY entry point ship code uses. Provider implementations live behind
 * the PublishingClient interface; swapping Post for Me → Postiz → direct
 * APIs touches zero call sites.
 *
 * Validation here is structural. Business rules — trial quota, connected-
 * account checks, target selection — belong to the calling action
 * (TASK-052), not the transport layer.
 */
export async function publish(
  client: PublishingClient,
  req: PublishRequest,
): Promise<ReturnType<PublishingClient["publish"]>> {
  if (req.targets.length === 0) {
    throw new Error("No publish targets: connect a platform first.");
  }

  const platforms = new Set(req.targets.map((t) => t.platform));
  if (platforms.size !== req.targets.length) {
    throw new Error("Duplicate platform in publish targets.");
  }

  for (const t of req.targets) {
    if (!t.socialAccountId) {
      throw new Error(`Target ${t.platform} is missing its connected account id.`);
    }
  }

  return client.publish(req);
}
