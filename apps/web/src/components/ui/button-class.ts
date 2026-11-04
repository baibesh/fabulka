import { variants } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "danger-outline" | "success" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "inline";

/**
 * The classes of a button, for a <Link> or <a> that looks like one. Heights come from the control
 * tokens (`--control-h*`), so the admin's compact density makes every button smaller at once. Kept
 * apart from the Button component so server components can use it too.
 */
export const buttonClass = variants({
  base: "inline-flex items-center justify-center gap-2 rounded-xl text-center transition disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
  variants: {
    variant: {
      primary: "bg-accent font-bold text-accent-foreground hover:brightness-105",
      secondary: "border border-border font-semibold hover:border-accent aria-pressed:border-accent aria-pressed:text-accent",
      outline: "border-2 border-accent font-bold text-accent hover:bg-accent/10",
      ghost: "font-semibold text-muted hover:text-foreground",
      danger: "bg-danger font-bold text-white hover:brightness-105",
      "danger-outline": "border border-border font-semibold text-danger hover:border-danger",
      success: "bg-success font-bold text-white hover:brightness-105",
      link: "font-semibold text-accent hover:underline",
    },
    size: {
      sm: "min-h-control-sm px-3 py-1 text-sm",
      md: "min-h-control px-control-x py-1",
      lg: "min-h-control-lg px-6 py-1 text-lg",
      inline: "",
    },
  },
  defaults: { variant: "primary", size: "md" },
});
