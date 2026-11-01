import type { HTMLAttributes, ReactNode } from "react";
import { cx, variants } from "./cx";

const card = variants({
  base: "border bg-card",
  variants: {
    radius: { md: "rounded-2xl", lg: "rounded-3xl" },
    padding: { none: "", sm: "p-4", md: "p-5", lg: "p-6", fluid: "p-5 sm:p-6" },
    border: { solid: "border-border", dashed: "border-dashed border-border", none: "border-transparent" },
    shadow: { none: "", sm: "shadow-sm" },
  },
  defaults: { radius: "md", padding: "md", border: "solid", shadow: "none" },
});

/**
 * A surface on the page: card background, border, rounded corners. With a `title` (and an `action`
 * on its right) it gets a header row; the layout of the rest comes from `className`.
 */
export function Card({
  as: Tag = "section",
  title,
  action,
  radius,
  padding,
  border,
  shadow,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  as?: "section" | "div" | "li" | "article";
  title?: ReactNode;
  action?: ReactNode;
  radius?: "md" | "lg";
  padding?: "none" | "sm" | "md" | "lg" | "fluid";
  border?: "solid" | "dashed" | "none";
  shadow?: "none" | "sm";
}) {
  return (
    <Tag className={card({ radius, padding, border, shadow, className })} {...rest}>
      {(title || action) && (
        <div className={cx("flex items-center justify-between gap-3")}>
          {title && <h2 className="font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}
