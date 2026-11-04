"use client";

import { useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type MouseEventHandler, type ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button-class";
import { cx, variants } from "./cx";
import { Spinner } from "./spinner";

export { buttonClass, type ButtonSize, type ButtonVariant };

/**
 * A click handler that runs once at a time: when it returns a promise, the button is busy until the
 * promise settles, and clicks meanwhile are dropped. The lock is a ref, so a second click that lands
 * before React re-renders the button as disabled is dropped too.
 */
function useOnceAtATime(onClick: MouseEventHandler<HTMLButtonElement> | undefined) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const handle =
    onClick &&
    ((event: MouseEvent<HTMLButtonElement>) => {
      if (running.current) {
        event.preventDefault();
        return;
      }
      const result: unknown = onClick(event);
      if (!(result instanceof Promise)) return;
      running.current = true;
      setBusy(true);
      const done = () => {
        running.current = false;
        setBusy(false);
      };
      // A failure is the handler's to show; the button only stops being busy.
      result.then(done, done);
    });
  return { busy, handle };
}

/**
 * A button. `icon` goes before the text and gives way to a spinner while `loading`; the text stays,
 * so the button keeps its size and name, and it is busy and disabled until the work is done. An
 * `onClick` that returns a promise makes it busy the same way until the promise settles.
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
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
}) {
  const { busy, handle } = useOnceAtATime(onClick);
  const working = loading || busy;
  return (
    <button
      type={type}
      disabled={disabled || working}
      aria-busy={working || undefined}
      className={buttonClass({ variant, size, className })}
      onClick={handle}
      {...rest}
    >
      {working ? <Spinner size={size === "lg" ? "md" : "sm"} /> : icon}
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

/**
 * A button with only an icon. Its `label` is required: it is the accessible name and the hover hint.
 * An `onClick` that returns a promise shows a spinner in place of the icon until it settles.
 */
export function IconButton({
  label,
  variant,
  size,
  shape,
  type = "button",
  disabled,
  className,
  children,
  onClick,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  variant?: "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  shape?: "square" | "round";
}) {
  const { busy, handle } = useOnceAtATime(onClick);
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(iconButton({ variant, size, shape }), className)}
      onClick={handle}
      {...rest}
    >
      {busy ? <Spinner size={size === "lg" ? "md" : "sm"} /> : children}
    </button>
  );
}
