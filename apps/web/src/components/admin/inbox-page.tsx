"use client";

import { useQuery } from "@tanstack/react-query";
import { LANGUAGE_NAMES, allowedFor, type InboxItem, type InboxSeverity } from "@fabulka/shared";
import { ArrowRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { adminCountryStats, adminInbox } from "@/lib/admin-api";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryState } from "@/components/ui/query-state";
import { Stat } from "@/components/ui/stat";
import { useCountryName } from "@/hooks/use-country-name";
import { formatSpendUsd, PageTitle, useAdminI18n } from "./ui";
import { useWorkingCountry } from "./working-country";
import { useWorkspaceName } from "./workspace-switcher";

const SEVERITY_ICON: Record<InboxSeverity, typeof Info> = { danger: CircleAlert, warning: TriangleAlert, info: Info };
const SEVERITY_TONE: Record<InboxSeverity, string> = { danger: "text-danger", warning: "text-warning", info: "text-muted" };

/**
 * The Inbox, each workspace's home page: what waits for someone, most urgent first, each row with a
 * link straight to the page that fixes it. Global: failed books, orders to move on, spend near its
 * caps, flagged pages, SEO drafts. A country: what its visitors miss (the country overview's gaps),
 * its new orders, SEO drafts in its languages, and its numbers today. The API leaves out what the
 * session may not open.
 */
export function InboxPage() {
  const { t } = useAdminI18n();
  const name = useWorkspaceName();
  const { country, access, href } = useWorkingCountry();
  const inbox = useQuery({ queryKey: ["admin", "inbox", country], queryFn: () => adminInbox(country), refetchInterval: 30_000 });
  const stats = country !== null && allowedFor(access, "dashboard", [country]);

  return (
    <>
      <PageTitle
        aside={
          stats && (
            <Link href={href("/admin/overview")} data-testid="inbox-overview-link" className={buttonClass({ variant: "secondary", size: "sm" })}>
              {t("admin.ws.nav.overview")}
              <ArrowRight className="size-4" />
            </Link>
          )
        }
      >
        {t("admin.inbox.title", { workspace: name(country) })}
      </PageTitle>
      {stats && <CountryNumbers country={country} />}
      {!inbox.data ? (
        <QueryState error={inbox.error} scope="admin" />
      ) : inbox.data.items.length === 0 ? (
        <EmptyState data-testid="inbox-empty" icon={<CircleCheck className="size-10 text-success" />} title={t("admin.inbox.empty.title")}>
          {t("admin.inbox.empty.text")}
        </EmptyState>
      ) : (
        <ul data-testid="inbox" data-country={country ?? "all"} className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {inbox.data.items.map((item, index) => (
            <Row key={`${item.kind}-${item.gap ?? ""}-${item.language ?? ""}-${item.country ?? ""}-${index}`} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}

/** One thing that waits: what, how urgent, and the way to fix it. */
function Row({ item }: { item: InboxItem }) {
  const { t } = useAdminI18n();
  const { href } = useWorkingCountry();
  const text = useInboxText();
  const Icon = SEVERITY_ICON[item.severity];
  return (
    <li
      data-testid="inbox-item"
      data-kind={item.kind}
      data-gap={item.gap ?? ""}
      data-language={item.language ?? ""}
      data-severity={item.severity}
      data-count={item.count}
      className="flex flex-wrap items-start gap-3 px-4 py-3"
    >
      <Icon aria-hidden className={cx("mt-0.5 size-5 shrink-0", SEVERITY_TONE[item.severity])} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold">{text(item)}</p>
        {item.samples.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {item.samples.map((sample) => (
              <li key={sample.id}>
                <Link href={href(sample.href)} data-testid="inbox-sample" className="text-muted hover:text-accent hover:underline">
                  {sample.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!item.href && <p className="text-xs text-muted">{t("admin.inbox.notYours")}</p>}
      </div>
      {item.href && (
        <Link href={href(item.href)} data-testid="inbox-fix" className={buttonClass({ variant: "secondary", size: "sm" })}>
          {item.kind === "gap" ? t("admin.inbox.fix") : t("admin.inbox.open")}
          <ArrowRight className="size-4" />
        </Link>
      )}
    </li>
  );
}

/** A row's words. */
function useInboxText() {
  const { t, number } = useAdminI18n();
  const countryName = useCountryName("admin");
  return (item: InboxItem): string => {
    const detail = item.detail ?? {};
    const language = item.language ? LANGUAGE_NAMES[item.language] : "";
    switch (item.kind) {
      case "gap":
        return item.gap ? t(`admin.overview.gap.${item.gap}`, { language }) : "";
      case "generation_paused":
        return t("admin.inbox.generation_paused");
      case "failed_books":
        return t("admin.inbox.failed_books", { count: item.count, days: Number(detail.days ?? 7) });
      case "orders_waiting":
        return t("admin.inbox.orders_waiting", { count: item.count });
      case "new_orders":
        return t("admin.inbox.new_orders", { count: item.count });
      case "spend_budget":
        return t("admin.inbox.spend_budget", { percent: item.count, used: formatSpendUsd(Number(detail.used ?? 0)), limit: formatSpendUsd(Number(detail.limit ?? 0)) });
      case "daily_cap":
        return t(detail.cap === "demo" ? "admin.inbox.daily_cap.demo" : "admin.inbox.daily_cap.regular", {
          percent: item.count,
          used: number(Number(detail.used ?? 0)),
          limit: number(Number(detail.limit ?? 0)),
        });
      case "staff_spend":
        return t("admin.inbox.staff_spend", { country: item.country ? countryName(item.country) : "", percent: item.count });
      case "page_flags":
        return t("admin.inbox.page_flags", { count: item.count });
      case "seo_drafts":
        return t("admin.inbox.seo_drafts", { count: item.count, language });
    }
  };
}

/** A country's numbers today, above its Inbox (the full set is in Overview). */
function CountryNumbers({ country }: { country: string }) {
  const { t, number, money } = useAdminI18n();
  const stats = useQuery({ queryKey: ["admin", "stats", "countries", country], queryFn: () => adminCountryStats(country), refetchInterval: 30_000 });
  if (!stats.data) return null;
  const s = stats.data;
  return (
    <div data-testid="inbox-numbers" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Stat label={t("admin.dashboard.booksToday")} value={number(s.books.today)} hint={t("admin.dashboard.total", { count: number(s.books.total) })} />
      <Stat label={t("admin.dashboard.ordersToday")} value={number(s.orders.today)} hint={t("admin.dashboard.total", { count: number(s.orders.total) })} />
      <Stat label={t("admin.dashboard.revenue")} value={`≈ ${money(s.orders.revenue.approxUsd)}`} />
      <Stat label={t("admin.dashboard.booksSpend")} value={formatSpendUsd(s.spend.booksTodayUsd)} />
    </div>
  );
}
