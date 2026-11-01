import { Loader2, type LucideProps } from "lucide-react";
import { cx, variants } from "./cx";

const spinner = variants({
  base: "shrink-0 animate-spin",
  variants: { size: { sm: "size-4", md: "size-5", lg: "size-10" } },
  defaults: { size: "md" },
});

/** A turning loader. Decorative unless given a `label`, which makes it a status for screen readers. */
export function Spinner({ size, label, className, ...rest }: Omit<LucideProps, "size"> & { size?: "sm" | "md" | "lg"; label?: string }) {
  return (
    <Loader2
      aria-hidden={label ? undefined : true}
      role={label ? "status" : undefined}
      aria-label={label}
      className={cx(spinner({ size }), className)}
      {...rest}
    />
  );
}
