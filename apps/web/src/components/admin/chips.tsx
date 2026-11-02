"use client";

import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { Flag } from "@/components/ui/flag";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cx } from "@/components/ui/cx";

/**
 * Picked values as chips with a flag, in their order: × takes one off, and + lists the options left.
 * `testId` prefixes the test ids: `${testId}-${value}` on a chip, `-remove-${value}` on its ×,
 * `-add` on the +, `-menu` on its list and `-option-${value}` on an option. `accent` marks a chip,
 * and `extra` renders more controls on it (before the ×).
 */
export function FlagChips<T extends string>({
  testId,
  values,
  options,
  name,
  flag,
  addLabel,
  removeLabel,
  onAdd,
  onRemove,
  accent,
  extra,
  menuClassName = "w-56",
}: {
  testId: string;
  values: readonly T[];
  /** Everything that may be picked, in the order the + lists them. */
  options: readonly T[];
  name: (value: T) => string;
  /** The country code of its flag ("other" gets a globe). */
  flag: (value: T) => string;
  addLabel: string;
  removeLabel: (name: string) => string;
  onAdd: (value: T) => void;
  onRemove: (value: T) => void;
  accent?: (value: T, index: number) => boolean;
  extra?: (value: T, index: number) => ReactNode;
  menuClassName?: string;
}) {
  const left = options.filter((option) => !values.includes(option));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {values.map((value, index) => {
        const label = name(value);
        return (
          <span
            key={value}
            data-testid={`${testId}-${value}`}
            className={cx(
              "flex items-center gap-1 rounded-full border py-1 pr-1 pl-2.5 text-sm font-semibold",
              accent?.(value, index) ? "border-accent bg-accent/10" : "border-border bg-card",
            )}
          >
            <Flag code={flag(value)} />
            <span>{label}</span>
            {extra?.(value, index)}
            <button
              type="button"
              data-testid={`${testId}-remove-${value}`}
              aria-label={removeLabel(label)}
              title={removeLabel(label)}
              onClick={() => onRemove(value)}
              className="rounded-full p-1 text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        );
      })}
      {left.length > 0 && (
        <Menu
          align="start"
          data-testid={`${testId}-menu`}
          className={menuClassName}
          trigger={({ props }) => (
            <button
              type="button"
              {...props}
              data-testid={`${testId}-add`}
              aria-label={addLabel}
              title={addLabel}
              className="flex size-8 items-center justify-center rounded-full border border-dashed border-border text-muted hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          )}
        >
          {(close) =>
            left.map((option) => (
              <MenuItem
                key={option}
                data-testid={`${testId}-option-${option}`}
                onClick={() => {
                  onAdd(option);
                  close();
                }}
              >
                <Flag code={flag(option)} />
                {name(option)}
              </MenuItem>
            ))
          }
        </Menu>
      )}
    </div>
  );
}
