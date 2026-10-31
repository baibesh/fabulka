import type { City } from "@fabulka/shared";
import type { UiLocale } from "@/i18n/messages";
import { useReference } from "./use-price";

const NONE: City[] = [];

/** Cities we deliver to, in the owner's order (edited in the admin); empty while loading. */
export function useCities(): City[] {
  return useReference().data?.cities ?? NONE;
}

/** The city's name in `locale`. The Russian name is the value an order stores; the rest are labels. */
export function cityName(value: string, locale: UiLocale, cities: readonly City[]): string {
  return cities.find((c) => c.ru === value)?.[locale] ?? value;
}
