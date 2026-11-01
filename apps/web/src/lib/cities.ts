import { cityName as nameIn, type City } from "@fabulka/shared";
import type { UiLocale } from "@/i18n/messages";
import { useReference } from "./use-price";

const NONE: City[] = [];

/** Cities we deliver to, in the owner's order (edited in the admin); empty while loading. */
export function useCities(): City[] {
  return useReference().data?.cities ?? NONE;
}

/**
 * The name in `locale` of the city an order was sent to: by its id, else by the Russian name the
 * order keeps (orders made before cities had ids), else that name as it is.
 */
export function cityName(order: { city: string; cityId?: string | null }, locale: UiLocale, cities: readonly City[]): string {
  const city = cities.find((c) => (order.cityId ? c.id === order.cityId : nameIn(c, "ru") === order.city));
  return city ? nameIn(city, locale) : order.city;
}
