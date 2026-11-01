import type { HTMLAttributes } from "react";
import { variants } from "./cx";

const skeleton = variants({
  base: "block animate-pulse",
  variants: {
    radius: { none: "", sm: "rounded", md: "rounded-xl", lg: "rounded-2xl", full: "rounded-full" },
    tone: { border: "bg-border", current: "bg-current/15" },
  },
  defaults: { radius: "sm", tone: "border" },
});

/**
 * A grey placeholder where content is still loading; its size comes from `className` (h-4 w-3/4,
 * aspect-square w-full …). Hidden from screen readers: the busy region around it says it loads.
 */
export function Skeleton({
  as: Tag = "span",
  radius,
  tone,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: "span" | "div" | "li"; radius?: "none" | "sm" | "md" | "lg" | "full"; tone?: "border" | "current" }) {
  return <Tag aria-hidden className={skeleton({ radius, tone, className })} {...rest} />;
}
