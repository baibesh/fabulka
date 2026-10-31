import type { BookStatus, OrderStatus } from "@fabulka/shared";
import type { ReactNode } from "react";
import { intlLocale } from "@/i18n/format";
import { useI18n } from "@/i18n/i18n";
import { formatDateTime, formatKzt, formatNumber } from "@/lib/format";

/** The badge colour of each book status; the label comes from the messages (admin.bookStatus.*). */
export const BOOK_STATUS_TONE: Record<BookStatus, string> = {
  queued: "bg-border text-muted",
  toy: "bg-amber-500/15 text-amber-600",
  story: "bg-amber-500/15 text-amber-600",
  hero: "bg-amber-500/15 text-amber-600",
  pages: "bg-amber-500/15 text-amber-600",
  pdf: "bg-amber-500/15 text-amber-600",
  done: "bg-emerald-500/15 text-emerald-600",
  failed: "bg-red-500/15 text-red-600",
};

/**
 * The admin's words and formats in the chosen language: `t` for messages, then dates, numbers,
 * tenge and durations formatted for that language, and the labels of statuses.
 */
export function useAdminI18n() {
  const { t, locale } = useI18n("admin");
  const decimal = (value: number) => value.toLocaleString(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    t,
    locale,
    date: (iso: string) => formatDateTime(iso, locale),
    number: (value: number) => formatNumber(value, locale),
    kzt: (amount: number) => formatKzt(amount, locale),
    percent: (share: number, digits = 0) =>
      share.toLocaleString(intlLocale(locale), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }),
    seconds: (seconds: number) => t("admin.seconds", { n: decimal(seconds) }),
    /** 850 → "850 мс", 2300 → "2,3 с"; null → "—". */
    ms: (ms: number | null) => (ms === null ? "—" : ms < 1000 ? t("admin.ms", { n: Math.round(ms) }) : t("admin.seconds", { n: decimal(ms / 1000) })),
    bookStatus: (status: BookStatus) => t(`admin.bookStatus.${status}`),
    orderStatus: (status: OrderStatus) => t(`admin.orderStatus.${status}`),
  };
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{children}</span>;
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-extrabold">{children}</h1>
      {aside}
    </div>
  );
}

export const table = "w-full text-left text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-muted [&_tbody_tr]:border-t [&_tbody_tr]:border-border";
export const input = "w-full rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-accent";
export const button = "rounded-xl bg-accent px-4 py-2 font-bold text-accent-foreground disabled:opacity-50";
export const ghostButton = "rounded-xl border border-border px-4 py-2 font-semibold hover:border-accent disabled:opacity-50";

/** Dollars of model spend: three decimals under a dollar, where single calls cost cents. */
export const formatUsd = (usd: number) => `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
