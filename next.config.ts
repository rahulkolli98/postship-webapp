import type { NextConfig } from "next";
import path from "node:path";

// ── TASK-078: security headers (mirrors landing/next.config.ts, extended
//    for the webapp's third parties: Clerk, Paddle checkout, PostHog) ────
//
// CSP notes for the webapp:
//   - `script-src` allows Clerk-js (*.clerk.accounts.dev / *.clerk.com) and
//     the Paddle.js CDN (cdn.paddle.com).
//   - `connect-src` allows Convex (HTTPS + WSS), Clerk FAPI, and Paddle
//     support endpoints. PostHog traffic is same-origin via /ingest, so
//     'self' covers it.
//   - `frame-src` allows Paddle's checkout overlay (their iframe loads on
//     our page) — landing's `frame-src 'none'` would break checkout here.
//   - `media-src blob:` — local video previews in the uploader are blob URLs.
//   - `img-src` adds img.clerk.com (avatars) and cdn.paddle.com.
//
// ROLLOUT: shipped as `Content-Security-Policy-Report-Only` first. Clerk's
// inline-script behaviour is the one genuine break risk, and breaking auth
// is the worst regression possible — so we OBSERVE console/report signals
// across sign-in + composer + checkout first, then flip the header name to
// enforced `Content-Security-Policy` (single-line change, one rebuild).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://cdn.paddle.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.clerk.com https://cdn.paddle.com",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.clerk.accounts.dev https://*.clerk.com https://*.paddle.com",
  "frame-src 'self' https://*.paddle.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  // HSTS — 2 years, include subdomains (no `preload`; hard to back out).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Stop MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking — page refuses to render inside an iframe.
  { key: "X-Frame-Options", value: "DENY" },
  // Consistent with the metadata.referrer setting.
  { key: "Referrer-Policy", value: "origin-when-cross-origin" },
  // Permissions Policy — disable features we never want embedded resources
  // to invoke. NOTE: `payment=()` deliberately omitted — the Paddle checkout
  // overlay may use the Payment Request API (Apple/Google Pay).
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "usb=()",
    ].join(", "),
  },
  // CSP in Report-Only mode for the first release (see rollout note above);
  // flip to "Content-Security-Policy" after observing clean sessions.
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

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
  // TASK-078: security headers baked into the worker response at build
  // time (same OpenNext-safe pattern as landing).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
