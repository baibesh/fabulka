import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/** The bordered card a table scrolls sideways in; `flush` for a table that already sits in a card. */
export function TableFrame({ flush = false, className, ...rest }: ComponentProps<"div"> & { flush?: boolean }) {
  return <div className={cx(flush ? "-mx-5 overflow-x-auto" : "overflow-x-auto rounded-2xl border border-border bg-card", className)} {...rest} />;
}

/** A data table: small text, muted headers, a line between rows. Put it in a <TableFrame>. */
export function Table({ className, ...rest }: ComponentProps<"table">) {
  return (
    <table
      className={cx(
        "w-full text-left text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-muted [&_tbody_tr]:border-t [&_tbody_tr]:border-border",
        className,
      )}
      {...rest}
    />
  );
}

/** The row a table shows when it has nothing to list. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
