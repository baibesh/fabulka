"use client";

import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { useDismiss } from "@/hooks/use-dismiss";
import { cx } from "./cx";

/** The look of a menu item, for a <Link role="menuitem"> as well as a <MenuItem>. */
export const menuItemClass =
  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-accent/10 focus-visible:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60";

/** A button inside a <Menu>. */
export function MenuItem({ className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} role="menuitem" className={cx(menuItemClass, className)} {...rest} />;
}

const items = (panel: HTMLElement | null) => [...(panel?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];

/**
 * A dropdown menu: `trigger` renders the button (spread the props it is given on it), the panel
 * opens under it and closes on a press outside, Esc or a choice (`children` gets `close`). Arrow
 * keys move between items. Props like data-testid go on the panel.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  trigger: (state: { open: boolean; props: ButtonHTMLAttributes<HTMLButtonElement> }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(root, open, close);
  // A panel opened near a screen edge (a "+" at the end of a wrapped row) would stick out and scroll
  // the page sideways: shift it back inside with an 8px margin.
  useLayoutEffect(() => {
    const node = panel.current;
    if (!open || !node) return;
    const { left, right } = node.getBoundingClientRect();
    const edge = document.documentElement.clientWidth - 8;
    const shift = right > edge ? Math.max(edge - right, 8 - left) : left < 8 ? 8 - left : 0;
    node.style.translate = shift ? `${shift}px 0` : "";
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items(panel.current);
    const index = list.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : null;
    if (next === null || !list.length) return;
    event.preventDefault();
    list[(next + list.length) % list.length].focus();
  };

  return (
    <div ref={root} className="relative">
      {trigger({ open, props: { "aria-expanded": open, "aria-haspopup": "menu", onClick: () => setOpen((value) => !value) } })}
      {open && (
        <div
          ref={panel}
          role="menu"
          onKeyDown={onKeyDown}
          className={cx(
            "absolute z-30 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl border border-border bg-card p-2 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
          {...rest}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
