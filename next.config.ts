import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Next.js 16 picks up multiple lockfiles (root postship + webapp).
  // Lock turbopack root to this app so it doesn't traverse upward.
  // Same fix as landing/next.config.ts (TASK-001).
  turbopack: {
    root: path.join(__dirname),
  },
  // TASK-070: PostHog reverse proxy (/ingest) — the official PostHog
  // Next.js pattern. Routes analytics through our origin so adblockers
  // that block posthog.com don't eat the data.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
};

export default nextConfig;
