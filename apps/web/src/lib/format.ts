import { formatMoney, type Money } from "@fabulka/shared";
import { intlLocale } from "@/i18n/format";
import type { UiLocale } from "@/i18n/messages";

/**
 * Money in its own currency, as the interface language writes it: "1 900 ₸" in Russian, "₸1,900"
 * in English, "18,90 €" in German, "$3.90" in English (see formatMoney in @fabulka/shared).
 */
export function formatPrice(money: Money, locale: UiLocale): string {
  return formatMoney(money, intlLocale(locale));
}

/** A count with the language's digit grouping: 12345 → "12 345" / "12,345". */
export function formatNumber(value: number, locale: UiLocale = "ru"): string {
  return value.toLocaleString(intlLocale(locale));
}

/** Day, month and time, the admin's way: "05.03, 14:20" in Russian. */
export function formatDateTime(iso: string, locale: UiLocale = "ru"): string {
  return new Date(iso).toLocaleString(intlLocale(locale), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** A day and time for parents, in their language: "1 нояб. 2026 г., 14:20" / "Nov 1, 2026, 2:20 PM". */
export function formatDayTime(iso: string, locale: UiLocale = "ru"): string {
  return new Date(iso).toLocaleString(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A day for parents, in their language: "1 нояб. 2026 г." / "Nov 1, 2026". */
export function formatDay(iso: string, locale: UiLocale = "ru"): string {
  return new Date(iso).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", year: "numeric" });
}
