import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx, variants } from "./cx";

const container = variants({
  base: "mx-auto flex w-full flex-col px-4 py-10",
  variants: {
    width: { sm: "max-w-2xl", md: "max-w-3xl", lg: "max-w-4xl", xl: "max-w-5xl" },
    gap: { none: "", md: "gap-6", lg: "gap-8", xl: "gap-10" },
  },
  defaults: { width: "xl", gap: "md" },
});

/** A site page's <main>: centred, padded, its sections stacked with one gap. Server-safe. */
export function PageContainer({
  width,
  gap,
  className,
  ...rest
}: ComponentProps<"main"> & { width?: "sm" | "md" | "lg" | "xl"; gap?: "none" | "md" | "lg" | "xl" }) {
  return <main className={container({ width, gap, className })} {...rest} />;
}

const titleSize = { sm: "text-2xl font-extrabold", md: "text-3xl font-extrabold", lg: "text-4xl font-extrabold leading-tight" };
const leadSize = { sm: "max-w-3xl text-sm text-muted", md: "text-muted", lg: "text-lg text-muted" };

/**
 * A page's heading: the h1, an optional lead under it and an `aside` on its right (filters, a save
 * button), plus anything else in `children` (a price tag). `sm` is the admin's size.
 */
export function PageHeader({
  title,
  lead,
  aside,
  size = "lg",
  className,
  children,
  ...rest
}: Omit<ComponentProps<"header">, "title"> & { title: ReactNode; lead?: ReactNode; aside?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const h1 = <h1 className={titleSize[size]}>{title}</h1>;
  return (
    <header className={cx("flex flex-col", size === "lg" ? "gap-3" : "gap-1", className)} {...rest}>
      {aside ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {h1}
          {aside}
        </div>
      ) : (
        h1
      )}
      {lead && <p className={leadSize[size]}>{lead}</p>}
      {children}
    </header>
  );
}

/** The way back to the page above: a small accent link («← Каталог»). The arrow is part of the text. */
export function BackLink({ className, ...rest }: ComponentProps<typeof Link>) {
  return <Link className={cx("flex items-center gap-1 self-start text-sm font-semibold text-accent hover:underline", className)} {...rest} />;
}
