import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

const box = "size-check shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50";

/** A native checkbox at the one checkbox size, in the accent colour. Wrap it in <ChoiceLabel> for its text. */
export function Checkbox({ className, ...rest }: Omit<ComponentProps<"input">, "type">) {
  return <input type="checkbox" className={cx(box, className)} {...rest} />;
}

/** A native radio at the same size as a checkbox. */
export function Radio({ className, ...rest }: Omit<ComponentProps<"input">, "type">) {
  return <input type="radio" className={cx(box, className)} {...rest} />;
}

/** A checkbox or radio with its text after it; clicking the text toggles it. */
export function ChoiceLabel({ strong = false, className, ...rest }: ComponentProps<"label"> & { strong?: boolean }) {
  return <label className={cx("flex cursor-pointer items-center gap-2 text-sm", strong ? "font-semibold" : "font-normal", className)} {...rest} />;
}

/** A radio (or checkbox) as a whole card, outlined in the accent colour when chosen. */
export function ChoiceCard({ control, children, className, ...rest }: ComponentProps<"label"> & { control: ReactNode; children: ReactNode }) {
  return (
    <label
      className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-4 has-[:checked]:border-accent", className)}
      {...rest}
    >
      {control}
      {children}
    </label>
  );
}
