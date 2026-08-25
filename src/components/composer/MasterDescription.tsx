"use client";

import { useState } from "react";

/**
 * MasterDescription — TASK-039 (PRD FR-004, US-005).
 *
 * Textarea with 20-char minimum gate, visible character count, and
 * Generate button disabled until the gate passes. The parent (Composer)
 * owns the value and the generation call; this component is just the
 * controlled input + button.
 */

export function MasterDescription({
  value,
  onChange,
  onGenerate,
  generating = false,
  generateHint,
}: {
  value: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  generating?: boolean;
  /** TASK-045b: microcopy beside the button, e.g. "Rewrites all selected captions". */
  generateHint?: string;
}) {
  const count = value.length;
  const canGenerate = count >= 20 && !generating;
  const [touched, setTouched] = useState(false);

  return (
    <div className="flex flex-col gap-3" data-testid="master-description">
      <label
        htmlFor="master-description"
        className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface"
      >
        Master description
      </label>
      <textarea
        id="master-description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder="Describe your video in your own voice — one paragraph is enough. We rewrite it for each platform."
        rows={5}
        className="min-h-[120px] w-full rounded-lg border border-border bg-surface-raised px-4 py-3 font-sans text-[15px] leading-[1.55] text-on-surface placeholder:text-on-surface-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/40"
        data-testid="master-description-input"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-muted">
          {count} characters
          {touched && count > 0 && count < 20 ? " · Need 20 to generate" : ""}
        </span>
        <div className="flex items-center gap-3">
          {generateHint && !generating && (
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-on-surface-subtle md:inline">
              {generateHint}
            </span>
          )}
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            data-testid="generate-button"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 font-sans text-sm font-medium text-primary-foreground transition-colors hover:bg-accent hover:text-on-accent disabled:pointer-events-none disabled:opacity-40"
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
