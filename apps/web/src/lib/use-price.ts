"use client";

import { useQuery } from "@tanstack/react-query";
import { bookPrice, orderPrice, type BookKind, type Cover } from "@fabulka/shared";
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

/** One printed copy with this cover, "9 900 ₸"; null while loading. */
export function useCoverPrice(cover: Cover): string | null {
  const prices = useReference().data?.prices;
  return prices ? formatKzt(prices.covers[cover]) : null;
}

/** What a printed order costs at the owner's prices; null while loading. The API prices it again. */
export function useOrderPrice(cover: Cover, quantity: number, city: string) {
  const data = useReference().data;
  return data ? orderPrice(cover, quantity, city, data.prices, data.cities) : null;
}
