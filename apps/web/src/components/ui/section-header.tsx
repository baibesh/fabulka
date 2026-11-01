import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/** A section's h2, with an optional icon before it and a lead line under it. */
export function SectionHeader({
  title,
  icon,
  lead,
  size = "lg",
  className,
  children,
  ...rest
}: Omit<ComponentProps<"header">, "title"> & { title: ReactNode; icon?: ReactNode; lead?: ReactNode; size?: "md" | "lg" | "xl" }) {
  const h2 = { md: "text-xl font-bold", lg: "text-2xl font-extrabold", xl: "text-3xl font-extrabold leading-tight" }[size];
  return (
    <header className={cx("flex flex-col gap-2", className)} {...rest}>
      <h2 className={cx(h2, Boolean(icon) && "flex items-center gap-2")}>
        {icon}
        {title}
      </h2>
      {lead && <p className="text-muted">{lead}</p>}
      {children}
    </header>
  );
}
