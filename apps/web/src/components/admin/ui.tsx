import type { BookStatus, Money, OrderStatus } from "@fabulka/shared";
import type { ComponentProps, ReactNode } from "react";
import { Card as UiCard } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { PageHeader } from "@/components/ui/page";
import type { BadgeTone } from "@/components/ui/badge";
import { intlLocale } from "@/i18n/format";
import { useI18n } from "@/i18n/i18n";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/format";

/** The badge colour of each book status; the label comes from the messages (admin.bookStatus.*). */
export const BOOK_STATUS_TONE: Record<BookStatus, BadgeTone> = {
  queued: "neutral",
  toy: "warning",
  story: "warning",
  hero: "warning",
  pages: "warning",
  pdf: "warning",
  done: "success",
  failed: "danger",
};

/**
 * The admin's words and formats in the chosen language: `t` for messages, then dates, numbers,
 * money and durations formatted for that language, and the labels of statuses.
 */
export function useAdminI18n() {
  const { t, locale } = useI18n("admin");
  const decimal = (value: number) => value.toLocaleString(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    t,
    locale,
    date: (iso: string) => formatDateTime(iso, locale),
    number: (value: number) => formatNumber(value, locale),
    money: (money: Money) => formatPrice(money, locale),
    percent: (share: number, digits = 0) =>
      share.toLocaleString(intlLocale(locale), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }),
    seconds: (seconds: number) => t("admin.seconds", { n: decimal(seconds) }),
    /** 850 → "850 мс", 2300 → "2,3 с"; null → "—". */
    ms: (ms: number | null) => (ms === null ? "—" : ms < 1000 ? t("admin.ms", { n: Math.round(ms) }) : t("admin.seconds", { n: decimal(ms / 1000) })),
    bookStatus: (status: BookStatus) => t(`admin.bookStatus.${status}`),
    orderStatus: (status: OrderStatus) => t(`admin.orderStatus.${status}`),
  };
}

/** The admin's card: the shared Card with its contents stacked. */
export function Card({ className, ...props }: ComponentProps<typeof UiCard>) {
  return <UiCard className={cx("flex flex-col gap-4", className)} {...props} />;
}

/** The admin's page heading: the shared PageHeader at the admin's size. */
export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <PageHeader size="sm" title={children} aside={aside} />;
}

/** Dollars of model spend: three decimals under a dollar, where single calls cost cents. */
export const formatSpendUsd = (usd: number) => `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
