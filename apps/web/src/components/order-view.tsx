"use client";

import { useQuery } from "@/lib/query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { getOrder } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { formatKzt } from "@/lib/format";
import { OrderAddress, OrderTimeline } from "./order-timeline";
import { QueryState } from "./ui/query-state";

export function OrderView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const { data: order, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    refetchInterval: (query) => (query.state.data?.status === "delivered" ? false : 2000),
  });

  if (!order) return <QueryState error={error} />;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/my#orders" data-testid="order-all" className="flex items-center gap-1 self-start text-sm font-semibold text-accent">
        <ArrowLeft className="size-4" />
        {t("order.all")}
      </Link>
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

      <OrderTimeline order={order} />

      <section className="flex flex-col gap-3 rounded-2xl bg-card p-5">
        <OrderAddress order={order} />
        <span className="text-lg font-extrabold">{t("order.done.total", { total: formatKzt(order.totalKzt, locale) })}</span>
      </section>
      <p className="text-center text-xs text-muted">{t("order.done.demo")}</p>
    </div>
  );
}
