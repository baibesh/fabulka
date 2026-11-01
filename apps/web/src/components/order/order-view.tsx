"use client";

import { useParams } from "next/navigation";

import { useQuery } from "@/lib/query";
import { ArrowLeft } from "lucide-react";
import { getOrder } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { useFormat } from "@/hooks/use-format";
import { OrderAddress, OrderTimeline } from "./order-timeline";
import { QueryState } from "../ui/query-state";
import { Card } from "../ui/card";
import { BackLink, PageHeader } from "../ui/page";

export function OrderView() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { kzt } = useFormat();
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
        <span className="text-lg font-extrabold">{t("order.done.total", { total: kzt(order.totalKzt) })}</span>
      </Card>
      <p className="text-center text-xs text-muted">{t("order.done.demo")}</p>
    </div>
  );
}
