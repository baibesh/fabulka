"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_STATUSES, type OrderStatus } from "@fabulka/shared";
import Link from "next/link";
import { Fragment, useState } from "react";
import { adminOrders, setOrderStatus } from "@/lib/admin-api";
import { PageTitle, useAdminI18n } from "./ui";
import { ErrorText } from "@/components/ui/notice";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Flag } from "@/components/ui/flag";
import { useAdminHref, useWorkingCountry } from "./working-country";

export function OrdersTable() {
  const adminHref = useAdminHref();
  const { t, date, money, orderStatus } = useAdminI18n();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const [open, setOpen] = useState<string | null>(null);
  // A status picked but not saved yet, with the note for the parent typed under it.
  const [change, setChange] = useState<{ id: string; status: OrderStatus; note: string } | null>(null);
  // The working country's orders (a manager's countries' only: the API limits them anyway).
  const { country, me } = useWorkingCountry();
  const books = me.permissions.includes("books");
  const orders = useQuery({ queryKey: ["admin", "orders", country], queryFn: () => adminOrders(country), refetchInterval: 10_000 });
  const update = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: OrderStatus; note: string }) => setOrderStatus(id, status, note.trim() || undefined),
    onSuccess: () => {
      setChange(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  return (
    <>
      <PageTitle
        aside={
          <Select data-testid="orders-filter" aria-label={t("admin.orders.status")} className="w-48" value={filter} onChange={(e) => setFilter(e.target.value as OrderStatus | "")}>
            <option value="">{t("admin.allStatuses")}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {orderStatus(s)}
              </option>
            ))}
          </Select>
        }
      >
        {t("admin.orders.title")}
      </PageTitle>
      {orders.isError && <ErrorText>{orders.error.message}</ErrorText>}
      <TableFrame>
        <Table data-testid="orders-table">
          <thead>
            <tr>
              <th>{t("admin.orders.book")}</th>
              <th>{t("admin.orders.recipient")}</th>
              <th>{t("admin.orders.address")}</th>
              <th>{t("admin.orders.cover")}</th>
              <th className="text-right">{t("admin.orders.sum")}</th>
              <th>{t("admin.orders.status")}</th>
              <th>{t("admin.orders.created")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.data?.filter((o) => !filter || o.status === filter).map((order) => (
              <Fragment key={order.id}>
                <tr data-testid="order-row" data-country={order.country ?? ""}>
                  <td>
                    {books ? (
                      <Link href={adminHref(`/admin/books/${order.bookId}`)} className="font-semibold hover:text-accent">
                        {order.bookTitle ?? t("admin.untitled")}
                      </Link>
                    ) : (
                      <span className="font-semibold">{order.bookTitle ?? t("admin.untitled")}</span>
                    )}
                  </td>
                  <td>
                    {order.recipientName}
                    <div className="text-xs text-muted">{order.phone}</div>
                  </td>
                  <td className="min-w-48">
                    {order.country && <Flag code={order.country} />} {order.city}
                    <div className="text-xs text-muted">{order.address}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    {order.cover === "hard" ? t("admin.orders.hard") : t("admin.orders.soft")} × {order.quantity}
                    {order.format && (
                      <div data-testid="order-format" data-format={order.format.id} className="text-xs text-muted">
                        {order.format.id} · {order.format.widthMm}×{order.format.heightMm} {t("admin.orders.mm")}
                      </div>
                    )}
                    {/* The printer's file: the frozen layout with bleed and crop marks (made on first click). */}
                    <a
                      data-testid="order-print-file"
                      href={`/api/admin/orders/${order.id}/print.pdf`}
                      download
                      className="block text-xs font-semibold text-accent"
                    >
                      {t("admin.orders.printFile")}
                    </a>
                  </td>
                  <td data-testid="order-total" data-currency={order.total.currency} data-amount={order.total.amount} className="text-right tabular-nums">
                    {money(order.total)}
                    {order.lines.map((line, i) => (
                      <span key={i} data-testid="order-line" data-currency={line.unit.currency} data-unit={line.unit.amount} className="block text-xs text-muted">
                        {line.format ?? ""} {line.cover} {line.quantity} × {money(line.unit)}
                      </span>
                    ))}
                  </td>
                  <td>
                    <Select
                      small
                      data-testid="order-status-select"
                      aria-label={t("admin.orders.status")}
                      className="w-36"
                      value={change?.id === order.id ? change.status : order.status}
                      disabled={update.isPending}
                      onChange={(e) => {
                        const status = e.target.value as OrderStatus;
                        setChange(status === order.status ? null : { id: order.id, status, note: "" });
                      }}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {orderStatus(s)}
                        </option>
                      ))}
                    </Select>
                    {change?.id === order.id && (
                      <form
                        data-testid="order-status-change"
                        aria-label={t("admin.orders.change", { status: orderStatus(change.status) })}
                        onSubmit={(e) => {
                          e.preventDefault();
                          update.mutate(change);
                        }}
                        className="mt-2 flex w-60 flex-col gap-2"
                      >
                        <Field label={t("admin.orders.note")} hint={t("admin.orders.note.hint")}>
                          <Input
                            small
                            data-testid="order-status-note"
                            maxLength={200}
                            value={change.note}
                            onChange={(e) => setChange({ ...change, note: e.target.value })}
                          />
                        </Field>
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" data-testid="order-status-save" loading={update.isPending}>
                            {t("admin.orders.change.save")}
                          </Button>
                          <Button variant="ghost" size="sm" data-testid="order-status-cancel" onClick={() => setChange(null)}>
                            {t("admin.orders.change.cancel")}
                          </Button>
                        </div>
                        {update.isError && <ErrorText className="text-xs">{update.error.message}</ErrorText>}
                      </form>
                    )}
                    <div className="text-xs text-muted">{order.manual ? t("admin.orders.manual") : t("admin.orders.timer")}</div>
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {date(order.createdAt)}
                    <button
                      type="button"
                      data-testid="order-history-toggle"
                      aria-expanded={open === order.id}
                      onClick={() => setOpen(open === order.id ? null : order.id)}
                      className="block text-xs font-semibold text-accent"
                    >
                      {open === order.id ? t("admin.orders.hideHistory") : t("admin.orders.history")}
                    </button>
                  </td>
                </tr>
                {open === order.id && (
                  <tr data-testid="order-history">
                    <td colSpan={7} className="bg-background/50">
                      <ol className="flex flex-col gap-1 text-sm">
                        {order.history.map((event, index) => (
                          <li key={index} data-testid="order-history-event" data-status={event.status} className="flex flex-wrap gap-x-3">
                            <span className="w-32 tabular-nums text-muted">{date(event.at)}</span>
                            <span className="font-semibold">{orderStatus(event.status)}</span>
                            {event.note && <span className="text-muted">{event.note}</span>}
                          </li>
                        ))}
                      </ol>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {orders.data?.length === 0 && <TableEmpty colSpan={7}>{t("admin.orders.empty")}</TableEmpty>}
          </tbody>
        </Table>
      </TableFrame>
    </>
  );
}
