import type { HTMLAttributes, ReactNode } from "react";
import { cx, variants } from "./cx";

export type NoticeTone = "neutral" | "subtle" | "accent" | "highlight" | "success" | "warning" | "danger";

const notice = variants({
  base: "flex rounded-2xl",
  variants: {
    tone: {
      neutral: "border border-border bg-card text-muted",
      subtle: "bg-background",
      accent: "border-2 border-accent bg-card",
      highlight: "border border-accent/40 bg-accent/10",
      success: "border border-success/40 bg-success/10",
      warning: "border border-warning/40 bg-warning/10",
      danger: "bg-danger/10 text-danger",
    },
    size: { sm: "gap-2 px-4 py-2 text-sm", md: "gap-3 p-4 text-sm", lg: "gap-4 p-5" },
  },
  defaults: { tone: "neutral", size: "md" },
});

/**
 * A boxed message in the flow of the page: an optional icon, title and trailing action (a close
 * button). The role is the caller's: `role="alert"` for an error, `role="status"` for news.
 */
export function Notice({
  as: Tag = "div",
  tone,
  size,
  icon,
  title,
  action,
  className,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  as?: "div" | "section" | "p";
  tone?: NoticeTone;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
}) {
  const Title = size === "lg" ? "h2" : "p";
  return (
    <Tag className={notice({ tone, size, className })} {...rest}>
      {icon}
      {Tag === "p" ? (
        <span className="mr-auto">{children}</span>
      ) : (
        <div className={cx("flex min-w-0 flex-1 flex-col", size === "lg" ? "gap-2" : "gap-1")}>
          {title && <Title className={size === "lg" ? "text-lg font-extrabold" : "font-semibold"}>{title}</Title>}
          {children}
        </div>
      )}
      {action}
    </Tag>
  );
}

/** An error said in place, read out at once: a failed request, a form that did not go through. */
export function ErrorText({ as: Tag = "p", className, ...rest }: HTMLAttributes<HTMLElement> & { as?: "p" | "span" }) {
  return <Tag role="alert" className={cx("text-danger", className)} {...rest} />;
}
