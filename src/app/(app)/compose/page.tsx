export default function ComposePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-muted">
        Composer
      </p>
      {/* design3 display face lands here in TASK-023 */}
      <h1 className="font-newsreader text-4xl font-medium tracking-[-0.025em] text-on-surface">
        Drop your videos. Write it once.
      </h1>
      <p className="mt-3 max-w-[560px] font-sans text-[15px] leading-[1.55] text-on-surface-muted">
        The composer empty state ships next. Connect a platform to start
        posting when the flow goes live.
      </p>
    </div>
  );
}
