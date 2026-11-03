"use client";

import { useQuery } from "@/lib/query";
import { bookPrice, citiesOf, deliveryFor, lowestCoverPrice, offeredFormats, quoteOrder, type BookKind, type Cover, type OrderQuote } from "@fabulka/shared";
import { useI18n } from "@/i18n/i18n";
import { getReference } from "./api";
import { formatPrice } from "./format";

/**
 * The owner's prices and delivery cities (GET /reference). Nothing is priced until they arrive:
 * callers show a skeleton rather than a price that may be stale.
 */
export function useReference() {
  return useQuery({ queryKey: ["reference"], queryFn: getReference, staleTime: 5 * 60_000 });
}

const NO_FORMATS: ReturnType<typeof offeredFormats> = [];

/**
 * Print as the visitor's country offers it, in its currency: its formats (switched on and priced
 * there), its delivery fee and rule, and its delivery cities; null while loading.
 */
export function useCountryPrint() {
  const { country, countries } = useI18n();
  const data = useReference().data;
  if (!data) return null;
  const pricing = { ...data, countries };
  return {
    formats: offeredFormats(country, pricing),
    delivery: deliveryFor(country, pricing),
    cities: citiesOf(country, data.cities),
  };
}

/** The print formats offered in the visitor's country; empty while loading. */
export function useCountryFormats() {
  return useCountryPrint()?.formats ?? NO_FORMATS;
}

/**
 * One more book of this kind, priced for the visitor's country in its currency and written the
 * interface language's way ("1 900 ₸", "18,90 €", "$3.90"); null while loading or when unpriced.
 */
export function useBookPrice(kind: BookKind): string | null {
  const { country, countries, locale } = useI18n();
  const data = useReference().data;
  const price = data ? bookPrice(kind, country, { ...data, countries }) : null;
  return price ? formatPrice(price, locale) : null;
}

/**
 * One printed copy with this cover: in the book's format when it is offered, else the cheapest
 * offered one; null while loading.
 */
export function useCoverPrice(cover: Cover, formatId?: string): string | null {
  const { locale } = useI18n();
  const formats = useCountryPrint()?.formats;
  if (!formats) return null;
  const price = formats.find((f) => f.id === formatId)?.prices[cover] ?? lowestCoverPrice(formats, cover);
  return price ? formatPrice(price, locale) : null;
}

/**
 * What a printed order in this format to this city (by id) costs at the owner's prices, in the
 * country's currency; null while loading, for a format that is not offered or a currency with no
 * delivery fee. The API prices it again.
 */
export function useOrderPrice(bookId: string, formatId: string | undefined, cover: Cover, quantity: number, cityId: string): OrderQuote | null {
  const print = useCountryPrint();
  const format = print?.formats.find((f) => f.id === formatId);
  if (!print || !format) return null;
  try {
    return quoteOrder({ bookId, format, cover, quantity, cityId, delivery: print.delivery, cities: print.cities });
  } catch {
    return null;
  }
}
