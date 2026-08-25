import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";

/**
 * TASK-053 — Post for Me OAuth CALLBACK / SYNC.
 *
 * PFM does NOT return tokens to us. After the user approves a platform on
 * PFM's hosted consent page, PFM stores the connection in OUR project and
 * redirects the browser to the **Project Redirect URL** configured in the
 * PFM dashboard — which must point HERE:
 *
 *   {origin}/api/oauth/postforme/callback
 *
 * This endpoint then syncs server-to-server: GET /social-accounts (Bearer
 * key) returns every connected account for our project (sa_ ids, platform,
 * username, avatar). We upsert each into Convex `accounts` with
 * `platformUserId = sa id` so posts.ship can target them.
 *
 * Token columns: PFM manages OAuth tokens itself; we never see them. The
 * schema requires an accessToken string, so we store a documented sentinel.
 */

const DEFAULT_BASE_URL = "https://api.postforme.dev";

/** Sentinel stored because PFM owns token lifecycles — never used by us. */
const PFM_MANAGED_TOKEN = "__PFM_MANAGED__";

// Singleton, same pattern as the waitlist route.
const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210",
);

// Their platform naming: config key is "x" but some records may carry
// "twitter". Map conservatively to ours; unknown platforms are skipped.
function normalizePlatform(raw: string): string | null {
  const p = raw.toLowerCase();
  if (p === "twitter") return "x";
  if (["youtube", "linkedin", "x", "threads", "instagram", "tiktok"].includes(p)) {
    return p;
  }
  return null;
}

type PfmSocialAccount = {
  id: string;
  platform?: string;
  username?: string | null;
  display_name?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  picture?: string | null;
};

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const apiKey = process.env.POSTFORME_API_KEY;
  if (!apiKey) {
    return NextResponse.redirect(
      new URL("/settings/accounts?error=postforme-not-configured", request.url),
    );
  }

  const baseUrl = process.env.POSTFORME_API_BASE_URL ?? DEFAULT_BASE_URL;

  try {
    const res = await fetch(`${baseUrl}/social-accounts?limit=100`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.error("[pfm-callback] social-accounts fetch failed:", res.status);
      return NextResponse.redirect(
        new URL("/settings/accounts?error=sync-failed", request.url),
      );
    }

    const payload = (await res.json().catch(() => null)) as
      | { items?: PfmSocialAccount[]; data?: PfmSocialAccount[] }
      | PfmSocialAccount[]
      | null;

    // Paginated wrapper or bare array — accept both.
    const rows: PfmSocialAccount[] = Array.isArray(payload)
      ? payload
      : (payload?.items ?? payload?.data ?? []);

    let synced = 0;
    for (const row of rows.slice(0, 12)) {
      // Cap per call; bounded-harm note lives on the mutation.
      const platform = normalizePlatform(row.platform ?? "");
      if (!platform || !row.id) continue;

      await convex.mutation(api.accounts.upsertFromPostForMe, {
        clerkUserId: session.id,
        platform: platform as
          | "youtube"
          | "linkedin"
          | "x"
          | "threads"
          | "instagram"
          | "tiktok",
        platformUserId: row.id,
        platformUsername: row.username ?? undefined,
        platformDisplayName:
          row.display_name ?? row.name ?? row.username ?? undefined,
        platformAvatarUrl:
          (row.avatar_url ?? row.picture) || undefined,
        accessToken: PFM_MANAGED_TOKEN,
      });
      synced++;
    }

    const origin = new URL(request.url).origin;
    return NextResponse.redirect(
      new URL(`/settings/accounts?connected=${synced}`, origin),
    );
  } catch (err) {
    console.error("[pfm-callback] sync failed:", err);
    return NextResponse.redirect(
      new URL("/settings/accounts?error=sync-failed", request.url),
    );
  }
}
