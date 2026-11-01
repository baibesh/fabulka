import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/** A figure in a card: what it counts, the number, and a hint under it. `testId` marks the number. */
export function Stat({
  label,
  value,
  hint,
  testId,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { label: ReactNode; value: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <div className={cx("flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 sm:p-5", className)} {...rest}>
      <span className="text-sm text-muted">{label}</span>
      <span data-testid={testId} className="text-2xl font-extrabold tabular-nums sm:text-3xl">
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
