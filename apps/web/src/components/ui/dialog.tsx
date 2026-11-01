"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, IconButton } from "./button";
import { cx } from "./cx";

/**
 * A dialog on the native <dialog>: it traps focus, closes on Esc and on a click outside, and gives
 * focus back to what opened it. Focus goes to the element marked `data-autofocus`, else to the first
 * control. The content is rendered only while open, so it starts afresh each time. `sheet` slides
 * the panel to the right edge at full height, for details beside a list. The close button's test id
 * is `${testId}-close`.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  closeLabel,
  testId,
  variant = "modal",
  role,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  testId?: string;
  variant?: "modal" | "sheet";
  role?: "dialog" | "alertdialog";
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

  const sheet = variant === "sheet";
  return (
    <dialog
      ref={ref}
      role={role}
      data-testid={testId}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      // The dialog itself is hit only outside its content (the backdrop).
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "overflow-hidden border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40",
        sheet
          ? "my-0 mr-0 ml-auto h-dvh max-h-none w-full max-w-xl border-l backdrop:backdrop-blur-none"
          : "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border backdrop:backdrop-blur-sm",
      )}
    >
      {open && (
        <div className={cx("flex flex-col gap-3 p-5", sheet ? "h-full gap-4 overflow-y-auto" : "max-h-[min(80vh,40rem)]")}>
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
            <IconButton variant="ghost" data-testid={testId ? `${testId}-close` : undefined} label={closeLabel} onClick={onClose} className="-mt-1 -mr-1">
              <X className="size-5" />
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/**
 * «Are you sure?» before something that cannot be undone: the question, a confirm button in the
 * danger colour (busy while `pending`) and a way out.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  pending = false,
  testId,
  confirmTestId,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  pending?: boolean;
  testId?: string;
  confirmTestId?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} closeLabel={closeLabel} testId={testId} role="alertdialog">
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose} data-autofocus="">
          {cancelLabel}
        </Button>
        <Button variant="danger" data-testid={confirmTestId} loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
