import type { HTMLAttributes, ReactNode } from "react";
import { variants } from "./cx";

const empty = variants({
  base: "",
  variants: {
    variant: {
      panel: "flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border p-10 text-center",
      box: "rounded-3xl border border-dashed border-border p-6 text-muted",
      plain: "p-8 text-center text-muted",
    },
  },
  defaults: { variant: "panel" },
});

/**
 * Nothing here yet. `panel`: an icon, a title, a line and a way on; `box`: one dashed line of text;
 * `plain`: a quiet line inside a card or list.
 */
export function EmptyState({
  variant = "panel",
  icon,
  title,
  action,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & { variant?: "panel" | "box" | "plain"; icon?: ReactNode; title?: ReactNode; action?: ReactNode }) {
  if (variant !== "panel") {
    return (
      <p className={empty({ variant, className })} {...rest}>
        {children}
      </p>
    );
  }
  return (
    <div className={empty({ variant, className })} {...rest}>
      {icon}
      {title && <p className="text-lg font-bold">{title}</p>}
      {children && <p className="text-muted">{children}</p>}
      {action}
    </div>
  );
}
