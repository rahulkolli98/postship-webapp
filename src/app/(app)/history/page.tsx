import { PostHistory } from "@/components/history/PostHistory";

export const metadata = { title: "History" };

/**
 * /history — TASK-059. Route protection handled by src/proxy.ts.
 */
export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
        History
      </p>
      <PostHistory />
    </div>
  );
}
