import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

/**
 * TASK-053 — Post for Me OAuth START.
 *
 * GET /api/oauth/postforme/start?platform=youtube
 *
 * Asks Post for Me (server-to-server, Bearer key) for the hosted consent
 * URL for ONE platform, then 302s the browser there. After the user
 * approves, PFM redirects to the **Project Redirect URL** configured in
 * their dashboard — point that at our /api/oauth/postforme/callback.
 *
 * Consent is per platform (vendor reality) — the settings UI offers one
 * connect action per network. `external_id` carries our clerkUserId so
 * PFM-side records can be correlated if support ever needs it.
 */

const DEFAULT_BASE_URL = "https://api.postforme.dev/v1";

const VALID_PLATFORMS = new Set([
  "youtube",
  "linkedin",
  "x",
  "threads",
  "instagram",
  "tiktok",
]);

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const url = new URL(request.url);
  const platform = (url.searchParams.get("platform") ?? "").toLowerCase();
  if (!VALID_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { ok: false, error: "Unsupported platform. Use one of: youtube, linkedin, x, threads, instagram, tiktok." },
      { status: 400 },
    );
  }

  const apiKey = process.env.POSTFORME_API_KEY;
  if (!apiKey) {
    return NextResponse.redirect(
      new URL("/settings/accounts?error=postforme-not-configured", request.url),
    );
  }

  const baseUrl = process.env.POSTFORME_API_BASE_URL ?? DEFAULT_BASE_URL;

  try {
    const res = await fetch(`${baseUrl}/social-accounts/auth-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform,
        // Correlates the PFM-side record with our user (support/debug aid).
        external_id: session.id,
        permissions: ["posts"],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[pfm-oauth] auth-url failed:", res.status, detail.slice(0, 300));
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=pfm-auth-url-${res.status}`, request.url),
      );
    }

    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      return NextResponse.redirect(
        new URL("/settings/accounts?error=pfm-no-url", request.url),
      );
    }

    return NextResponse.redirect(data.url);
  } catch (err) {
    console.error("[pfm-oauth] start failed:", err);
    return NextResponse.redirect(
      new URL("/settings/accounts?error=pfm-start-failed", request.url),
    );
  }
}
