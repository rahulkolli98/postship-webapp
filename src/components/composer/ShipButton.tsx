"use client";

/**
 * ShipButton — TASK-054 (PRD § 8: bottom "Ship" button).
 *
 * UX policy (founder-approved): NEVER grey-walled for missing connections —
 * click surfaces an explanatory banner instead. Disabled ONLY for missing
 * content (no video / no selection / all captions empty) or while a ship is
 * already in flight.
 */

export function ShipButton({
  disabled,
  shipping,
  onClick,
}: {
  disabled: boolean;
  shipping: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || shipping}
      data-testid="ship-button"
      className="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary font-sans text-sm font-semibold uppercase tracking-[0.08em] text-primary-foreground transition-colors hover:bg-accent hover:text-on-accent disabled:pointer-events-none disabled:opacity-40"
    >
      {shipping ? "Shipping…" : "Ship"}
    </button>
  );
}
