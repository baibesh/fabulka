import { citiesOf, cityName as nameIn, type City } from "@fabulka/shared";
import { useI18n } from "@/i18n/i18n";
import type { UiLocale } from "@/i18n/messages";
import { useReference } from "./use-price";

const NONE: City[] = [];

/** Cities we deliver to in the visitor's country, in the owner's order (edited in the admin); empty while loading. */
export function useCities(): City[] {
  const { country } = useI18n();
  const cities = useReference().data?.cities;
  return cities ? citiesOf(country, cities) : NONE;
}

/** Every delivery city of every country, for naming the city of an order whatever country it went to. */
export function useAllCities(): City[] {
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
