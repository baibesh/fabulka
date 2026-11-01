"use client";

import { LANGUAGE_NAMES, OTHER_COUNTRY, bookPrice, cityName, faqFor, fillFaq, localized, lowestCoverPrice, type FaqPlaceholder } from "@fabulka/shared";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { formatKzt, formatPrice } from "@/lib/format";
import { regionName } from "@/lib/regions";
import { useReference } from "@/lib/use-price";
import { Section } from "./section";

/**
 * What parents ask before making a book, as native disclosure widgets. The questions are the
 * owner's (reference.faq): the ones for the visitor's country, in the interface language, with
 * prices and cities filled in from the reference data. They change with the country.
 */
export function Faq() {
  const { t, locale, country, countries, info } = useI18n();
  const reference = useReference().data;
  const items = reference ? faqFor(reference.faq, country, countries) : null;
  const vars: Partial<Record<FaqPlaceholder, string>> = reference
    ? {
        templatePrice: formatPrice(bookPrice("template", country, reference.prices, countries)),
        customPrice: formatPrice(bookPrice("custom", country, reference.prices, countries)),
        softCover: formatKzt(lowestCoverPrice(reference.formats, "soft") ?? 0, locale),
        hardCover: formatKzt(lowestCoverPrice(reference.formats, "hard") ?? 0, locale),
        delivery: formatKzt(reference.prices.deliveryKzt, locale),
        freeCities: reference.cities
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
              <details key={item.id} data-testid={`faq-item-${item.id}`} className="group rounded-2xl border border-border bg-card px-5 py-4 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold [&::-webkit-details-marker]:hidden">
                  {fillFaq(localized(item.q, locale), vars)}
                  <ChevronDown className="size-5 shrink-0 text-accent transition group-open:rotate-180" />
                </summary>
                <p className="pt-3 whitespace-pre-line text-muted">{fillFaq(localized(item.a, locale), vars)}</p>
              </details>
            ))}
      </div>
    </Section>
  );
}
