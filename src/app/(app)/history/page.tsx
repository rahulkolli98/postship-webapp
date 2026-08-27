import { PostHistory } from "@/components/history/PostHistory";

export const metadata = { title: "History" };

/**
 * /history — TASK-059 (PRD FR-009 / US-012). Route protection handled by
 * src/proxy.ts.
 */
export default function HistoryPage() {
  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
          History
        </p>
        <PostHistory />
      </div>
    </div>
  );
}
