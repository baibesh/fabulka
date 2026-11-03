"use client";

import { ChevronDown } from "lucide-react";
import type { AriaAttributes, ComponentProps } from "react";
import { cx } from "./cx";
import { useFieldControl } from "./field";

/** What every text control shares: one height and padding from the tokens, one border, red when invalid. */
const base =
  "rounded-xl border border-border bg-background px-control-x font-normal text-foreground transition placeholder:text-muted/70 focus:border-accent aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-50";
/** Full width unless `className` sets a width of its own (w-48, w-auto); a breakpoint width (sm:w-48) still starts full. */
const control = (code: boolean | undefined, className: string | undefined) =>
  cx(base, code ? "font-mono text-xs" : "text-control", !/(^|\s)w-/.test(className ?? "") && "w-full", className);

/**
 * `invalid` marks the control red (and aria-invalid); `code` sets it in small monospace, for slugs and
 * prompts; `small` is the short height, for a control inside a row of a list.
 */
type Invalid = { invalid?: boolean; code?: boolean; small?: boolean };
const invalidProp = (invalid: boolean | undefined, props: { "aria-invalid"?: AriaAttributes["aria-invalid"] }) =>
  invalid === undefined ? props["aria-invalid"] : invalid || undefined;

/** A text input. Inside a <Field> it is labelled and described by it; `invalid` marks it red. */
export function Input({ invalid, code, small, className, ...props }: ComponentProps<"input"> & Invalid) {
  const wired = useFieldControl({ ...props, "aria-invalid": invalidProp(invalid, props) });
  return <input className={cx(control(code, className), small ? "h-control-sm" : "h-control")} {...wired} />;
}

/** A multi-line input; its height comes from `rows` or a min-h-* in `className`. */
export function Textarea({ invalid, code, className, ...props }: ComponentProps<"textarea"> & Omit<Invalid, "small">) {
  const wired = useFieldControl({ ...props, "aria-invalid": invalidProp(invalid, props) });
  return <textarea className={cx(control(code, className), "py-2")} {...wired} />;
}

/**
 * A native select with the inputs' height and border. The browser's own arrow sits on the very edge
 * and differs by system, so it is hidden and our chevron drawn inside the padding instead; `className`
 * sizes the wrapper (w-48), the select fills it.
 */
export function Select({ invalid, code, small, className, ...props }: ComponentProps<"select"> & Invalid) {
  const wired = useFieldControl({ ...props, "aria-invalid": invalidProp(invalid, props) });
  return (
    <span className={cx("relative block", !/(^|\s)w-/.test(className ?? "") && "w-full", className)}>
      <select
        className={cx(control(code, "w-full"), "appearance-none pr-10", small ? "h-control-sm" : "h-control")}
        {...wired}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted"
      />
    </span>
  );
}
