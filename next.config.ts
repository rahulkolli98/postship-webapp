import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Next.js 16 picks up multiple lockfiles (root postship + webapp).
  // Lock turbopack root to this app so it doesn't traverse upward.
  // Same fix as landing/next.config.ts (TASK-001).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
