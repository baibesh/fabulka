"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ORDER_STATUSES, type OrderStatus } from "@fabulka/shared";
import Link from "next/link";
import { useState } from "react";
import { adminOrders, setOrderStatus } from "@/lib/admin-api";
import { input, PageTitle, table, useAdminI18n } from "./ui";

export function OrdersTable() {
  const { t, date, kzt, orderStatus } = useAdminI18n();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: adminOrders, refetchInterval: 10_000 });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => setOrderStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });

  return (
    <>
      <PageTitle
        aside={
          <select data-testid="orders-filter" className={`${input} w-48`} value={filter} onChange={(e) => setFilter(e.target.value as OrderStatus | "")}>
            <option value="">{t("admin.allStatuses")}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {orderStatus(s)}
              </option>
            ))}
          </select>
        }
      >
        {t("admin.orders.title")}
      </PageTitle>
      {orders.isError && <p role="alert" className="text-red-600">{orders.error.message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table data-testid="orders-table" className={table}>
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
              <tr key={order.id} data-testid="order-row">
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
                  <select
                    data-testid="order-status-select"
                    className={`${input} w-36 py-1`}
                    value={order.status}
                    disabled={update.isPending}
                    onChange={(e) => update.mutate({ id: order.id, status: e.target.value as OrderStatus })}
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {orderStatus(s)}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-muted">{order.manual ? t("admin.orders.manual") : t("admin.orders.timer")}</div>
                </td>
                <td className="whitespace-nowrap text-muted">{date(order.createdAt)}</td>
              </tr>
            ))}
            {orders.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  {t("admin.orders.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
