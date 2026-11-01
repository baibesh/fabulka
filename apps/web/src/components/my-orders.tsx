"use client";

import { useQuery } from "@/lib/query";
import { BookOpen, ChevronRight, Package } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useI18n } from "@/i18n/i18n";
import { listMyOrders } from "@/lib/api";
import { formatDay, formatKzt } from "@/lib/format";
import { ErrorNotice } from "./error-notice";
import { OrderAddress, OrderTimeline } from "./order-timeline";

/**
 * «Мои заказы»: printed orders with where each one is. Shown when there are orders, or when the
 * visitor's country has print (then an empty note says where orders will appear).
 */
export function MyOrders() {
  const { t, locale, info } = useI18n();
  const orders = useQuery({
    queryKey: ["my-orders"],
    queryFn: listMyOrders,
    refetchInterval: (query) => (query.state.data?.some((o) => o.status !== "delivered") ? 5000 : false),
  });

  const loaded = Boolean(orders.data);
  // /my#orders (the account menu, the order page): the section appears once orders load, so scroll then.
  useEffect(() => {
    if (loaded && window.location.hash === "#orders") document.getElementById("orders")?.scrollIntoView();
  }, [loaded]);

  if (orders.error) return <ErrorNotice error={orders.error} />;
  if (!orders.data) return null;
  if (!orders.data.length && !info.print) return null;

  return (
    <section id="orders" data-testid="my-orders" className="flex scroll-mt-24 flex-col gap-4">
      <h2 className="flex items-center gap-2 text-2xl font-extrabold">
        <Package className="size-6 text-accent" />
        {t("my.orders.title")}
      </h2>
      {!orders.data.length ? (
        <p data-testid="my-orders-empty" className="rounded-3xl border border-dashed border-border p-6 text-muted">
          {t("my.orders.empty")}
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {orders.data.map((order) => (
            <li key={order.id} data-testid="my-order" data-order-id={order.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex gap-4">
                {order.bookImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
                  <img src={order.bookImageUrl} alt="" className="size-16 shrink-0 rounded-xl bg-white object-contain" />
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-border">
                    <BookOpen className="size-6 text-muted" />
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-bold">{order.bookTitle ?? t("my.orders.title")}</span>
                  <span className="text-sm text-muted">
                    {t(order.cover === "hard" ? "order.cover.hard" : "order.cover.soft")} × {order.quantity} · {formatKzt(order.totalKzt, locale)}
                  </span>
                  <span className="text-xs text-muted">{t("my.orders.placed", { date: formatDay(order.createdAt, locale) })}</span>
                </div>
              </div>
              <OrderTimeline order={order} compact />
              <OrderAddress order={order} />
              <Link
                href={`/orders/${order.id}`}
                data-testid="my-order-open"
                className="flex items-center gap-1 self-start text-sm font-semibold text-accent"
              >
                {t("my.orders.open")}
                <ChevronRight className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
