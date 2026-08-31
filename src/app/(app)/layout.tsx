import { AppShell } from "@/components/AppShell";
import { PaddleInit } from "@/components/PaddleInit";

/**
 * Authenticated app layout — TASK-022.
 *
 * Route group `(app)` holds everything behind sign-in (Compose, History,
 * Settings). Route protection itself lives in src/proxy.ts; this layout
 * provides the shared chrome (top nav + sidebar).
 *
 * TASK-061: PaddleInit warms up Paddle.js once per session (no-op without
 * NEXT_PUBLIC_PADDLE_CLIENT_TOKEN).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PaddleInit />
      <AppShell>{children}</AppShell>
    </>
  );
}
