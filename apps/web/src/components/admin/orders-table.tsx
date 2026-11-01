"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_STATUSES, type OrderStatus } from "@fabulka/shared";
import Link from "next/link";
import { Fragment, useState } from "react";
import { adminOrders, setOrderStatus } from "@/lib/admin-api";
import { PageTitle, useAdminI18n } from "./ui";
import { ErrorText } from "@/components/ui/notice";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { Select } from "@/components/ui/input";

export function OrdersTable() {
  const { t, date, kzt, orderStatus } = useAdminI18n();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const [open, setOpen] = useState<string | null>(null);
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: adminOrders, refetchInterval: 10_000 });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => setOrderStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
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
                <tr data-testid="order-row">
                  <td>
                    <Link href={`/admin/books/${order.bookId}`} className="font-semibold hover:text-accent">
                      {order.bookTitle ?? t("admin.untitled")}
                    </Link>
                  </td>
                  <td>
                    {order.recipientName}
                    <div className="text-xs text-muted">{order.phone}</div>
                  </td>
                  <td className="min-w-48">
                    {order.city}
                    <div className="text-xs text-muted">{order.address}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    {order.cover === "hard" ? t("admin.orders.hard") : t("admin.orders.soft")} × {order.quantity}
                  </td>
                  <td className="text-right tabular-nums">{kzt(order.totalKzt)}</td>
                  <td>
                    <Select
                      small
                      data-testid="order-status-select"
                      aria-label={t("admin.orders.status")}
                      className="w-36"
                      value={order.status}
                      disabled={update.isPending}
                      onChange={(e) => update.mutate({ id: order.id, status: e.target.value as OrderStatus })}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {orderStatus(s)}
                        </option>
                      ))}
                    </Select>
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
