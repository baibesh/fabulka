import type { Currency } from "@fabulka/shared";
import { intlLocale } from "@/i18n/format";
import type { UiLocale } from "@/i18n/messages";

const kzt = new Map<UiLocale, Intl.NumberFormat>();

/** 14900 → "14 900 ₸" (in English "14,900 ₸") */
export function formatKzt(amount: number, locale: UiLocale = "ru"): string {
  let number = kzt.get(locale);
  if (!number) {
    number = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
    kzt.set(locale, number);
  }
  return `${number.format(amount)} ₸`;
}

/** 5.9 → "$5.90" */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** A price in its own currency: "1 900 ₸" or "$3.90". */
export function formatPrice({ amount, currency }: { amount: number; currency: Currency }): string {
  return currency === "KZT" ? formatKzt(amount) : formatUsd(amount);
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
