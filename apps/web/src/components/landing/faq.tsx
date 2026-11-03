"use client";

import {
  LANGUAGE_NAMES,
  OTHER_COUNTRY,
  bookPrice,
  citiesOf,
  cityName,
  deliveryFor,
  fillFaq,
  landingFaq,
  lowestCoverPrice,
  offeredFormats,
  type FaqPlaceholder,
  type Money,
} from "@fabulka/shared";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { formatPrice } from "@/lib/format";
import { regionName } from "@/lib/regions";
import { useReference } from "@/lib/use-price";
import { Section } from "./section";

/**
 * What parents ask before making a book, as native disclosure widgets. The questions are the
 * owner's (reference.faq): the ones for the visitor's country, less those the country's landing
 * hides, plus the country's own (reference.landing), in the interface language, with prices and
 * cities filled in from the reference data. They change with the country.
 */
export function Faq() {
  const { t, locale, country, countries, info } = useI18n();
  const reference = useReference().data;
  const items = reference ? landingFaq(reference.faq, reference.landing, country, countries, locale) : null;
  const pricing = reference ? { ...reference, countries } : null;
  // Print as the country offers it, in its currency: its formats, delivery fee and cities.
  const formats = pricing ? offeredFormats(country, pricing) : [];
  const delivery = pricing ? deliveryFor(country, pricing) : null;
  const money = (price: Money | null) => (price ? formatPrice(price, locale) : "—");
  const vars: Partial<Record<FaqPlaceholder, string>> =
    reference && pricing
      ? {
          templatePrice: money(bookPrice("template", country, pricing)),
          customPrice: money(bookPrice("custom", country, pricing)),
          softCover: money(lowestCoverPrice(formats, "soft")),
          hardCover: money(lowestCoverPrice(formats, "hard")),
          delivery: delivery?.freeEverywhere || !delivery?.fee ? t("order.free") : money(delivery.fee),
          freeCities: citiesOf(country, reference.cities)
            .filter((c) => c.freeDelivery)
            .map((c) => cityName(c, locale))
            .join(", "),
          languages: info.languages.map((l) => LANGUAGE_NAMES[l]).join(", "),
          country: country === OTHER_COUNTRY ? t("country.other") : regionName(country, locale),
        }
      : {};

  return (
    <Section id="faq" testId="faq" title={t("landing.faq.title")}>
      <div className="flex flex-col gap-3">
        {items === null
          ? [0, 1, 2, 3].map((i) => <div key={i} aria-hidden className="h-14 animate-pulse rounded-2xl border border-border bg-card" />)
          : items.map((item) => (
              <details
                key={`${item.own ? "own" : "shared"}-${item.id}`}
                data-testid={item.own ? `faq-item-country-${item.id}` : `faq-item-${item.id}`}
                className="group rounded-2xl border border-border bg-card px-5 py-4 open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold [&::-webkit-details-marker]:hidden">
                  {fillFaq(item.q, vars)}
                  <ChevronDown className="size-5 shrink-0 text-accent transition group-open:rotate-180" />
                </summary>
                <p className="pt-3 whitespace-pre-line text-muted">{fillFaq(item.a, vars)}</p>
              </details>
            ))}
      </div>
    </Section>
  );
}
