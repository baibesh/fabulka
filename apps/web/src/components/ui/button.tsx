import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx, variants } from "./cx";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "danger-outline" | "success" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "inline";

/**
 * The classes of a button, for a <Link> or <a> that looks like one. Heights come from the control
 * tokens (`--control-h*`), so the admin's compact density makes every button smaller at once.
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

/**
 * A button. `icon` goes before the text and gives way to a spinner while `loading`; the text stays,
 * so the button keeps its size and name, and it is busy and disabled until the work is done.
 */
export function Button({
  variant,
  size,
  icon,
  iconEnd,
  loading = false,
  type = "button",
  disabled,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
      {...rest}
    >
      {loading ? <Spinner size={size === "lg" ? "md" : "sm"} /> : icon}
      {children}
      {iconEnd}
    </button>
  );
}

const iconButton = variants({
  base: "inline-flex shrink-0 items-center justify-center transition disabled:cursor-not-allowed disabled:opacity-40",
  variants: {
    variant: {
      secondary: "border border-border bg-card text-foreground hover:border-accent",
      ghost: "text-muted hover:bg-border/50 hover:text-foreground",
      danger: "border border-border bg-card text-danger hover:border-danger",
    },
    size: { sm: "size-control-sm", md: "size-control", lg: "size-control-lg" },
    shape: { square: "rounded-xl", round: "rounded-full" },
  },
  defaults: { variant: "secondary", size: "sm", shape: "square" },
});

/** A button with only an icon. Its `label` is required: it is the accessible name and the hover hint. */
export function IconButton({
  label,
  variant,
  size,
  shape,
  type = "button",
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  variant?: "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  shape?: "square" | "round";
}) {
  return (
    <button type={type} aria-label={label} title={label} className={cx(iconButton({ variant, size, shape }), className)} {...rest}>
      {children}
    </button>
  );
}
