import { AppShell } from "@/components/AppShell";
import { RevenueCatInit } from "@/components/RevenueCatInit";

/**
 * Authenticated app layout — TASK-022.
 *
 * Route group `(app)` holds everything behind sign-in (Compose, History,
 * Settings). Route protection itself lives in src/proxy.ts; this layout
 * provides the shared chrome (top nav + sidebar).
 *
 * TASK-061: RevenueCatInit configures the Web Billing SDK once per session
 * (no-op without NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RevenueCatInit />
      <AppShell>{children}</AppShell>
    </>
  );
}
