"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { initRevenueCat } from "../lib/revenuecat";

/**
 * RevenueCatInit — TASK-061.
 *
 * Configures the RevenueCat Web SDK once per signed-in session, keyed to the
 * Clerk user id (the SDK requires an explicit appUserId on web). Renders
 * nothing; a missing NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY makes it a no-op.
 */
export function RevenueCatInit() {
  const { isSignedIn, user } = useUser();
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !user) return;
    if (attemptedFor.current === user.id) return;
    attemptedFor.current = user.id;
    initRevenueCat(user.id);
  }, [isSignedIn, user]);

  return null;
}
