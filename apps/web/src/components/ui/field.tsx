"use client";

import { createContext, use, useId, type AriaAttributes, type ReactNode } from "react";
import { cx } from "./cx";

interface FieldWiring {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldWiring | null>(null);

/**
 * The id, description and validity a control inside a <Field> takes: the label points at it, the
 * hint and the error describe it, and an error marks it invalid. Props passed directly win.
 */
export function useFieldControl<P extends { id?: string; "aria-describedby"?: string; "aria-invalid"?: AriaAttributes["aria-invalid"] }>(props: P): P {
  const field = use(FieldContext);
  if (!field) return props;
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": cx(field.describedBy, props["aria-describedby"]) || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}

/**
 * A labelled form field: the label, one control (Input, Select, Textarea), an optional hint and the
 * error. The control gets its id, aria-describedby and aria-invalid from here; test ids go on the
 * control itself. `optional` is the «необязательно» note after the label.
 */
export function Field({
  label,
  hint,
  error,
  errorTestId,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  errorTestId?: string;
  optional?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = cx(hint ? hintId : undefined, error ? errorId : undefined) || undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {optional && <span className="font-normal text-muted"> {optional}</span>}
      </label>
      <FieldContext value={{ id, describedBy, invalid: Boolean(error) }}>{children}</FieldContext>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} data-testid={errorTestId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
