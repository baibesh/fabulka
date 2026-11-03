"use client";

import { useI18n } from "@/i18n/i18n";
import type { Money } from "@fabulka/shared";
import { formatDateTime, formatDay, formatDayTime, formatNumber, formatPrice } from "@/lib/format";

/** Money, numbers and dates in the interface language (the admin's with `"admin"`). */
export function useFormat(scope: "site" | "admin" = "site") {
  const { locale } = useI18n(scope);
  return {
    locale,
    /** "1 900 ₸", "18,90 €": money in its own currency. */
    money: (money: Money) => formatPrice(money, locale),
    number: (value: number) => formatNumber(value, locale),
    /** "1 нояб. 2026 г." */
    day: (iso: string) => formatDay(iso, locale),
    /** "1 нояб. 2026 г., 14:20" */
    dayTime: (iso: string) => formatDayTime(iso, locale),
    /** "05.03, 14:20", the admin's short form. */
    dateTime: (iso: string) => formatDateTime(iso, locale),
  };
}
