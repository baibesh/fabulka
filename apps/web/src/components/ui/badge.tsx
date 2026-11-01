import type { HTMLAttributes } from "react";
import { variants } from "./cx";

export type BadgeTone = "neutral" | "accent" | "solid" | "success" | "warning" | "danger";

const badge = variants({
  base: "inline-flex items-center rounded-full",
  variants: {
    tone: {
      neutral: "bg-border font-bold text-muted",
      accent: "bg-accent/15 font-bold text-accent",
      solid: "bg-accent font-extrabold text-accent-foreground",
      success: "bg-success/15 font-bold text-success",
      warning: "bg-warning/15 font-bold text-warning",
      danger: "bg-danger/15 font-bold text-danger",
    },
    size: { sm: "px-2.5 py-0.5 text-xs", md: "px-2.5 py-1 text-xs", lg: "px-3 py-1" },
  },
  defaults: { tone: "neutral", size: "sm" },
});

/** A small rounded label: a status, an age range, a price. One <span>, so a test can find its text right inside. */
export function Badge({ tone, size, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; size?: "sm" | "md" | "lg" }) {
  return <span className={badge({ tone, size, className })} {...rest} />;
}
