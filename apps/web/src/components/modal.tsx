"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./ui/button";

/**
 * A modal dialog on the native <dialog>: it traps focus, closes on Esc and on a click outside, and
 * gives focus back to what opened it. Focus goes to the element marked `data-autofocus`, else to the
 * first control. The content is rendered only while open, so it starts afresh each time.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  closeLabel,
  testId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  closeLabel: string;
  testId?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-testid={testId}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      // The dialog itself is hit only outside its content (the backdrop).
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="flex max-h-[min(80vh,40rem)] flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-lg font-bold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton
              variant="ghost"
              data-testid={testId ? `${testId}-close` : undefined}
              label={closeLabel}
              onClick={onClose}
              className="-mt-1 -mr-1"
            >
              <X className="size-5" />
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
