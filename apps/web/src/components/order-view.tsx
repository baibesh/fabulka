"use client";

import { useQuery } from "@tanstack/react-query";
import { ORDER_STATUSES, type OrderStatus } from "@fabulka/shared";
import { CheckCircle2, Circle, CreditCard, Home, Printer, Truck } from "lucide-react";
import { use } from "react";
import { getOrder } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { cityName, useCities } from "@/lib/cities";
import { formatKzt } from "@/lib/format";
import { ErrorNotice } from "./error-notice";

const ICONS: Record<OrderStatus, typeof Circle> = { paid: CreditCard, printing: Printer, shipped: Truck, delivered: Home };

export function OrderView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const cities = useCities();
  const { data: order, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    refetchInterval: (query) => (query.state.data?.status === "delivered" ? false : 2000),
  });

  if (error) return <ErrorNotice error={error} />;
  if (!order) return <p className="text-muted">{t("common.loading")}</p>;

  const current = ORDER_STATUSES.indexOf(order.status);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">{t("order.done.title")}</h1>
        <p className="text-muted">
          {t("order.done.summary", {
            title: order.bookTitle ?? "",
            quantity: order.quantity,
            cover: t(order.cover === "hard" ? "order.cover.hard" : "order.cover.soft").toLowerCase(),
          })}
        </p>
      </header>

      <ol data-testid="order-status" data-status={order.status} className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-6">
        {ORDER_STATUSES.map((status, index) => {
          const Icon = ICONS[status];
          const done = index <= current;
          return (
            <li key={status} className={`flex items-center gap-3 ${done ? "font-bold" : "text-muted"}`}>
              {done ? <CheckCircle2 className="size-5 text-accent" /> : <Circle className="size-5" />}
              <Icon className="size-5" />
              {t(`order.status.${status}`)}
            </li>
          );
        })}
      </ol>

      <section className="flex flex-col gap-1 rounded-2xl bg-card p-5">
        <span>
          {order.recipientName}, {cityName(order, locale, cities)}, {order.address}
        </span>
        <span className="text-lg font-extrabold">{t("order.done.total", { total: formatKzt(order.totalKzt) })}</span>
      </section>
      <p className="text-center text-xs text-muted">{t("order.done.demo")}</p>
    </div>
  );
}
