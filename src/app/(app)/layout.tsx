import { AppShell } from "@/components/AppShell";

/**
 * Authenticated app layout — TASK-022.
 *
 * Route group `(app)` holds everything behind sign-in (Compose, History,
 * Settings). Route protection itself lives in src/proxy.ts; this layout
 * provides the shared chrome (top nav + sidebar).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
