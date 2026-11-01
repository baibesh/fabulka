"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx, variants } from "./cx";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  testId?: string;
}

const tab = variants({
  base: "text-sm font-semibold whitespace-nowrap transition",
  variants: {
    variant: {
      pills: "rounded-xl px-4 py-2 aria-selected:bg-accent/15 aria-selected:text-accent not-aria-selected:text-muted not-aria-selected:hover:text-foreground",
      segmented:
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 aria-selected:bg-card aria-selected:shadow-sm not-aria-selected:text-muted not-aria-selected:hover:text-foreground",
    },
  },
  defaults: { variant: "pills" },
});

const list = { pills: "flex gap-1 overflow-x-auto", segmented: "flex gap-1 rounded-xl bg-background p-1" };

/** The ids that tie a tab list to its panels; pass the same `base` to <Tabs> and tabPanelProps(). */
export function useTabsId(): string {
  return useId();
}

/** What a tab panel needs: its role, id and the tab that labels it. */
export function tabPanelProps(base: string, value: string) {
  return { role: "tabpanel", id: `${base}-panel-${value}`, "aria-labelledby": `${base}-tab-${value}`, tabIndex: 0 } as const;
}

/**
 * Tabs with the full ARIA pattern: one tab in the tab order, arrow keys (and Home/End) move between
 * tabs and select them, each tab controls its panel. `pills` for page sections, `segmented` for a
 * switch inside a card.
 */
export function Tabs<T extends string>({
  base,
  items,
  value,
  onChange,
  label,
  variant = "pills",
  className,
  ...rest
}: {
  base: string;
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  variant?: "pills" | "segmented";
  className?: string;
  "data-testid"?: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === value);
    const next =
      event.key === "ArrowRight" ? (index + 1) % items.length
      : event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length
      : event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    const id = items[next].id;
    onChange(id);
    refs.current.get(id)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cx(list[variant], className)} {...rest}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) refs.current.set(item.id, node);
              else refs.current.delete(item.id);
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            data-testid={item.testId}
            onClick={() => onChange(item.id)}
            className={tab({ variant })}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
