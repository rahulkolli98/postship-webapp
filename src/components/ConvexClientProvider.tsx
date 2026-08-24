"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

/**
 * Convex client wired to Clerk auth — TASK-021 (PRD § 2, § 9).
 *
 * Must render INSIDE <ClerkProvider> (Convex reads Clerk's context to mint
 * session tokens). Tokens carry the "convex" applicationID claim and are
 * validated server-side by convex/auth.config.ts.
 */
if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in your .env file");
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
