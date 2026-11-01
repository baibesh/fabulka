"use client";

import { orderTimeline, type Order, type OrderStatus } from "@fabulka/shared";
import { CheckCircle2, Circle, Home, PackageCheck, Printer, Truck } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { cityName, useCities } from "@/lib/cities";
import { formatDayTime } from "@/lib/format";

const ICONS: Record<OrderStatus, typeof Circle> = { paid: PackageCheck, printing: Printer, shipped: Truck, delivered: Home };

/**
 * Where a printed order is: accepted → printing → handed to delivery → delivered, each reached step
 * with its date, the current one highlighted.
 */
export function OrderTimeline({ order, compact = false }: { order: Order; compact?: boolean }) {
  const { t, locale } = useI18n();
  const steps = orderTimeline(order);
  const current = steps.findLastIndex((s) => s.reached);
  const notes = new Map(order.history.filter((e) => e.note).map((e) => [e.status, e.note]));
  return (
    <ol
      data-testid="order-status"
      data-status={order.status}
      aria-label={t("order.timeline")}
      className={`flex flex-col ${compact ? "gap-2" : "gap-3 rounded-3xl border border-border bg-card p-6"}`}
    >
      {steps.map((step, index) => {
        const Icon = ICONS[step.status];
        const isCurrent = index === current;
        return (
          <li
            key={step.status}
            data-testid={`order-step-${step.status}`}
            data-reached={step.reached}
            aria-current={isCurrent ? "step" : undefined}
            className={`flex items-start gap-3 ${step.reached ? "" : "text-muted"}`}
          >
            {step.reached ? (
              <CheckCircle2 className={`mt-0.5 size-5 shrink-0 ${isCurrent ? "text-accent" : "text-emerald-600"}`} />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0" />
            )}
            <Icon className="mt-0.5 size-5 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className={isCurrent ? "font-extrabold text-accent" : step.reached ? "font-semibold" : ""}>
                {t(`order.status.${step.status}`)}
              </span>
              {step.at && (
                <time data-testid="order-step-date" dateTime={step.at} className="text-xs text-muted">
                  {formatDayTime(step.at, locale)}
                </time>
              )}
              {step.reached && notes.get(step.status) && <span className="text-xs text-muted">{notes.get(step.status)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Who gets the order and where: recipient, masked phone, city in the visitor's language, address. */
export function OrderAddress({ order }: { order: Order }) {
  const { t, locale } = useI18n();
  const cities = useCities();
  return (
    <dl data-testid="order-address" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted">{t("order.recipient")}</dt>
      <dd className="font-semibold">{order.recipientName}</dd>
      <dt className="text-muted">{t("order.phone")}</dt>
      <dd className="tabular-nums">{order.phoneMasked}</dd>
      <dt className="text-muted">{t("order.address")}</dt>
      <dd>
        {cityName(order, locale, cities)}, {order.address}
      </dd>
    </dl>
  );
}
