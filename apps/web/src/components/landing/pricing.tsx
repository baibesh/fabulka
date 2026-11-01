"use client";

import { Check, Gift } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import type { MessageKey } from "@/i18n/messages";
import { formatKzt } from "@/lib/format";
import { useBookPrice, useReference } from "@/lib/use-price";
import { PriceSkeleton } from "../price-skeleton";
import { Section } from "./section";

interface Plan {
  testId: string;
  title: string;
  /** Null while the owner's prices load. */
  price: string | null;
  points: string[];
  note?: string;
}

/** The two kinds of books, the printed copy, and the free books every visitor starts with. */
export function Pricing() {
  const { t, locale, info } = useI18n();
  const reference = useReference().data;
  const templatePrice = useBookPrice("template");
  const customPrice = useBookPrice("custom");
  const points = (...keys: MessageKey[]) => keys.map((key) => t(key));
  const plans: Plan[] = [
    {
      testId: "price-template",
      title: t("landing.pricing.template.title"),
      price: templatePrice,
      points: points("landing.pricing.template.plot", "landing.pricing.template.questions", "landing.pricing.pdf"),
    },
    {
      testId: "price-custom",
      title: t("landing.pricing.custom.title"),
      price: customPrice,
      points: points("landing.pricing.custom.theme", "landing.pricing.custom.method", "landing.pricing.pdf"),
    },
    {
      testId: "price-print",
      title: t("landing.pricing.print.title"),
      price: reference ? t("landing.pricing.from", { price: formatKzt(reference.prices.covers.soft) }) : null,
      points: reference
        ? [
            t("landing.pricing.print.covers", { soft: formatKzt(reference.prices.covers.soft), hard: formatKzt(reference.prices.covers.hard) }),
            t("landing.pricing.print.delivery", {
              cities: reference.cities
                .filter((c) => c.freeDelivery)
                .map((c) => c[locale])
                .join(", "),
              fee: formatKzt(reference.prices.deliveryKzt),
            }),
          ]
        : [],
      note: info.print ? undefined : t("book.print.unavailable"),
    },
  ];

  return (
    <Section id="pricing" testId="pricing" title={t("landing.pricing.title")} lead={t("landing.pricing.lead")}>
      <p data-testid="free-books" className="flex items-center gap-3 rounded-2xl bg-accent/15 p-4 font-semibold">
        <Gift className="size-6 shrink-0 text-accent" />
        {t("landing.pricing.free")}
      </p>
      <ul className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <li key={plan.testId} data-testid={plan.testId} className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-extrabold">{plan.title}</h3>
            <p className="text-3xl font-extrabold text-accent">{plan.price ?? <PriceSkeleton className="w-28" />}</p>
            <ul className="flex flex-col gap-2 text-sm">
              {plan.points.map((point) => (
                <li key={point} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                  {point}
                </li>
              ))}
            </ul>
            {plan.note && <p className="mt-auto text-sm font-semibold text-muted">{plan.note}</p>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
