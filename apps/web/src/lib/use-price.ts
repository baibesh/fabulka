"use client";

import { useQuery } from "@/lib/query";
import { bookPrice, lowestCoverPrice, orderPrice, type BookKind, type Cover } from "@fabulka/shared";
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

/** One more book of this kind, priced for the visitor's country: "1 900 ₸" or "$3.90"; null while loading. */
export function useBookPrice(kind: BookKind): string | null {
  const { country, countries } = useI18n();
  const prices = useReference().data?.prices;
  return prices ? formatPrice(bookPrice(kind, country, prices, countries)) : null;
}

/**
 * One printed copy with this cover, "9 900 ₸": in the book's format when it is offered, else the
 * cheapest offered one; null while loading.
 */
export function useCoverPrice(cover: Cover, formatId?: string): string | null {
  const formats = useReference().data?.formats;
  if (!formats) return null;
  const format = formats.find((f) => f.id === formatId);
  return formatKzt(format ? format.prices[cover] : (lowestCoverPrice(formats, cover) ?? 0));
}

/**
 * What a printed order in this format to this city (by id) costs at the owner's prices; null while
 * loading or for a format that is not offered. The API prices it again.
 */
export function useOrderPrice(formatId: string | undefined, cover: Cover, quantity: number, cityId: string) {
  const data = useReference().data;
  const format = data?.formats.find((f) => f.id === formatId);
  return data && format ? orderPrice(format, cover, quantity, cityId, data.prices, data.cities) : null;
}
