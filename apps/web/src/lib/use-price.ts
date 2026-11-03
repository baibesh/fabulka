"use client";

import { useQuery } from "@/lib/query";
import { bookPrice, citiesOf, deliveryFor, formatsFor, lowestCoverPrice, orderPrice, type BookKind, type Cover, type PrintFormat } from "@fabulka/shared";
import { useI18n } from "@/i18n/i18n";
import { getReference } from "./api";
import { formatKzt, formatPrice } from "./format";

/**
 * The owner's prices and delivery cities (GET /reference). Nothing is priced until they arrive:
 * callers show a skeleton rather than a price that may be stale.
 */
export function useReference() {
  return useQuery({ queryKey: ["reference"], queryFn: getReference, staleTime: 5 * 60_000 });
}

const NO_FORMATS: PrintFormat[] = [];

/**
 * Print as the visitor's country offers it: its formats (offered there, at its cover prices, else
 * the global ones), its delivery fee and rule, and its delivery cities; nulls while loading.
 */
export function useCountryPrint() {
  const { country } = useI18n();
  const data = useReference().data;
  if (!data) return null;
  return {
    formats: formatsFor(country, data.formats, data.countryFormats).filter((f) => f.published),
    delivery: deliveryFor(country, data.prices, data.countryDelivery),
    cities: citiesOf(country, data.cities),
  };
}

/** The print formats offered in the visitor's country; empty while loading. */
export function useCountryFormats(): PrintFormat[] {
  return useCountryPrint()?.formats ?? NO_FORMATS;
}

/**
 * One more book of this kind, priced for the visitor's country (its own prices when it has them,
 * else the global ones): "1 900 ₸" or "$3.90"; null while loading.
 */
export function useBookPrice(kind: BookKind): string | null {
  const { country, countries } = useI18n();
  const data = useReference().data;
  return data ? formatPrice(bookPrice(kind, country, data.prices, countries, data.countryPrices)) : null;
}

/**
 * One printed copy with this cover, "9 900 ₸": in the book's format when it is offered, else the
 * cheapest offered one; null while loading.
 */
export function useCoverPrice(cover: Cover, formatId?: string): string | null {
  const formats = useCountryPrint()?.formats;
  if (!formats) return null;
  const format = formats.find((f) => f.id === formatId);
  return formatKzt(format ? format.prices[cover] : (lowestCoverPrice(formats, cover) ?? 0));
}

/**
 * What a printed order in this format to this city (by id) costs at the owner's prices; null while
 * loading or for a format that is not offered. The API prices it again.
 */
export function useOrderPrice(formatId: string | undefined, cover: Cover, quantity: number, cityId: string) {
  const print = useCountryPrint();
  const format = print?.formats.find((f) => f.id === formatId);
  return print && format ? orderPrice(format, cover, quantity, cityId, print.delivery, print.cities) : null;
}
