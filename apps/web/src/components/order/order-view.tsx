"use client";

import { useParams } from "next/navigation";

import { useQuery } from "@/lib/query";
import { ArrowLeft } from "lucide-react";
import { getOrder } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { useFormat } from "@/hooks/use-format";
import { useReference } from "@/lib/use-price";
import { formatName } from "@fabulka/shared";
import { OrderAddress, OrderTimeline } from "./order-timeline";
import { QueryState } from "../ui/query-state";
import { Card } from "../ui/card";
import { BackLink, PageHeader } from "../ui/page";

export function OrderView() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { money } = useFormat();
  const formats = useReference().data?.formats;
  const { data: order, error } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    refetchInterval: (query) => (query.state.data?.status === "delivered" ? false : 2000),
  });

  if (!order) return <QueryState error={error} />;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/my#orders" data-testid="order-all">
        <ArrowLeft className="size-4" />
        {t("order.all")}
      </BackLink>
      <PageHeader
        size="md"
        title={t("order.done.title")}
        lead={t("order.done.summary", {
          title: order.bookTitle ?? "",
          quantity: order.quantity,
          cover: t(order.cover === "hard" ? "order.cover.hard" : "order.cover.soft").toLowerCase(),
        })}
      />

      <OrderTimeline order={order} />

      <Card border="none" className="flex flex-col gap-3">
        <OrderAddress order={order} />
        {/* What was ordered, as priced when ordered (in the order's currency, never converted). */}
        <ul data-testid="order-lines" data-currency={order.currency} className="flex flex-col gap-1 text-sm">
          {order.lines.map((line, i) => {
            const format = formats?.find((f) => f.id === line.format);
            return (
              <li key={i} data-testid="order-line" data-currency={line.total.currency} data-unit={line.unit.amount} data-total={line.total.amount} className="flex justify-between gap-3">
                <span>
                  {[format ? formatName(format, locale) : line.format, t(line.cover === "hard" ? "order.cover.hard" : "order.cover.soft")].filter(Boolean).join(", ")}{" "}
                  · {line.quantity} × {money(line.unit)}
                </span>
                <span className="tabular-nums">{money(line.total)}</span>
              </li>
            );
          })}
          <li data-testid="order-delivery" className="flex justify-between gap-3">
            <span>{t("order.delivery")}</span>
            <span className="tabular-nums">{order.delivery.amount ? money(order.delivery) : t("order.free")}</span>
          </li>
        </ul>
        <span data-testid="order-total" data-currency={order.total.currency} className="text-lg font-extrabold">
          {t("order.done.total", { total: money(order.total) })}
        </span>
      </Card>
      <p className="text-center text-xs text-muted">{t("order.done.demo")}</p>
    </div>
  );
}
