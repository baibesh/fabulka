"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { covers, isSuperAdmin, type AdminStats, type CountrySpend, type Revenue } from "@fabulka/shared";
import { Grid3x3, Pause, Play } from "lucide-react";
import Link from "next/link";
import { adminCountryStats, adminMe, adminStats, setPaused } from "@/lib/admin-api";
import { intlLocale } from "@/i18n/format";
import { Card, formatSpendUsd, PageTitle, useAdminI18n } from "./ui";
import { QueryState } from "@/components/ui/query-state";
import { Button, buttonClass } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { useCountryName } from "@/hooks/use-country-name";
import { useWorkingCountry } from "./working-country";

function Meter({ label, used, limit, format }: { label: string; used: number; limit: number; format?: (n: number) => string }) {
  const { t, number } = useAdminI18n();
  const show = format ?? number;
  const share = limit ? Math.min(used / limit, 1) : 0;
  const tone = share >= 0.9 ? "bg-red-500" : share >= 0.7 ? "bg-amber-500" : "bg-accent";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {t("admin.dashboard.of", { used: show(used), limit: show(limit) })}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const { t, number } = useAdminI18n();
  if (!rows.length) return <p className="text-sm text-muted">{t("admin.noData")}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate">{row.label}</span>
          <span className="h-2.5 rounded-full bg-accent/80" style={{ width: `${(row.value / max) * 100}%` }} />
          <span className="text-right tabular-nums text-muted">{number(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Revenue by currency as it was charged (never added across currencies), then roughly in dollars at
 * each sale's own rate, with how many sales had no rate.
 */
function RevenueLines({ revenue, testId }: { revenue: Revenue; testId: string }) {
  const { t, money } = useAdminI18n();
  if (!revenue.count) return <p className="text-xs text-muted">{t("admin.dashboard.sales.none")}</p>;
  return (
    <ul data-testid={testId} className="flex flex-col gap-0.5 text-xs text-muted">
      {revenue.byCurrency.map((row) => (
        <li key={row.currency} data-testid={`${testId}-${row.currency}`} data-amount={row.total.amount} data-count={row.count} className="tabular-nums">
          {money(row.total)} · {row.count}
        </li>
      ))}
      <li data-testid={`${testId}-usd`} data-amount={revenue.approxUsd.amount} className="font-semibold tabular-nums">
        {t("admin.dashboard.sales.approx", { amount: money(revenue.approxUsd) })}
        {revenue.unconverted > 0 && ` (${t("admin.dashboard.sales.unconverted", { count: revenue.unconverted })})`}
      </li>
    </ul>
  );
}

/** Staff generation today per country, against each country's cap. */
function StaffSpend({ rows }: { rows: CountrySpend[] }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  return (
    <Card title={t("admin.dashboard.staffSpend")} data-testid="staff-spend">
      {rows.length === 0 && <p className="text-sm text-muted">{t("admin.dashboard.staffSpend.none")}</p>}
      {rows.map((row) => {
        const label = row.country ? countryName(row.country) : t("admin.dashboard.staffSpend.noCountry");
        return (
          <div key={row.country ?? "none"} data-testid={`staff-spend-${row.country ?? "none"}`} data-usd={row.usd}>
            {row.capUsd !== null ? (
              <Meter label={label} used={row.usd} limit={row.capUsd} format={formatSpendUsd} />
            ) : (
              <div className="flex justify-between text-sm">
                <span>{label}</span>
                <span className="tabular-nums text-muted">{formatSpendUsd(row.usd)}</span>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

/**
 * The dashboard: the whole service's for global staff (the superadmin), else a country manager's,
 * of their countries only (the working one when picked), with no service-wide numbers.
 */
export function Dashboard() {
  const { access } = useWorkingCountry();
  const global = isSuperAdmin(access) || covers(access.global, "dashboard");
  return global ? <GlobalDashboard /> : <CountryDashboard />;
}

/** A country manager's dashboard: their countries' books, orders and spend today. */
function CountryDashboard() {
  const { t, number, money, bookStatus } = useAdminI18n();
  const countryName = useCountryName("admin");
  const { country, options } = useWorkingCountry();
  const stats = useQuery({ queryKey: ["admin", "stats", "countries", country], queryFn: () => adminCountryStats(country), refetchInterval: 10_000 });
  if (!stats.data) return <QueryState error={stats.error} scope="admin" />;
  const s = stats.data;
  const names = (country ? [country] : options).map((code) => countryName(code)).join(", ");
  return (
    <>
      <PageTitle>{t("admin.dashboard.title")}</PageTitle>
      <p data-testid="country-dashboard" data-countries={s.countries.join(" ")} className="text-sm text-muted">
        {t("admin.dashboard.scoped", { countries: names })}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("admin.dashboard.booksToday")} value={number(s.books.today)} hint={t("admin.dashboard.total", { count: number(s.books.total) })} testId="country-books-today" />
        <Stat label={t("admin.dashboard.ordersToday")} value={number(s.orders.today)} hint={t("admin.dashboard.total", { count: number(s.orders.total) })} testId="country-orders-today" />
        <Stat label={t("admin.dashboard.revenue")} value={`≈ ${money(s.orders.revenue.approxUsd)}`} testId="country-revenue-usd" />
        <Stat label={t("admin.dashboard.booksSpend")} value={formatSpendUsd(s.spend.booksTodayUsd)} testId="country-spend-today" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("admin.dashboard.byStatus")}>
          <Bars rows={Object.entries(s.books.byStatus).map(([status, n]) => ({ label: bookStatus(status as never), value: n }))} />
        </Card>
        <StaffSpend rows={s.spend.staff} />
        <Card title={t("admin.dashboard.revenue")} data-testid="country-revenue">
          <p className="text-sm text-muted">{t("admin.dashboard.sales.byCurrency")}</p>
          <RevenueLines revenue={s.orders.revenue} testId="country-revenue-lines" />
        </Card>
        <Card title={t("admin.dashboard.margin")} data-testid="country-margin" data-orders={s.orders.margin?.orders ?? 0} data-amount={s.orders.margin?.margin.amount ?? ""}>
          {s.orders.margin ? (
            <>
              <p className="text-2xl font-extrabold tabular-nums">≈ {money(s.orders.margin.margin)}</p>
              <p className="text-xs text-muted">
                {t("admin.dashboard.margin.hint", {
                  orders: s.orders.margin.orders,
                  revenue: money(s.orders.margin.revenue),
                  cost: money(s.orders.margin.cost),
                })}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">{t("admin.dashboard.margin.none")}</p>
          )}
        </Card>
      </div>
    </>
  );
}

function GlobalDashboard() {
  const { t, locale, number, money, percent } = useAdminI18n();
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: adminStats, refetchInterval: 10_000 });
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: adminMe, retry: false });
  const pause = useMutation({
    mutationFn: setPaused,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] }),
  });

  if (!stats.data) return <QueryState error={stats.error} scope="admin" />;
  const s: AdminStats = stats.data;
  const success = s.books.successRate === null ? "—" : percent(s.books.successRate);
  const avg = s.books.avgSeconds === null ? "—" : t("admin.seconds", { n: Math.round(s.books.avgSeconds) });
  const regionNames = new Intl.DisplayNames([intlLocale(locale)], { type: "region" });
  const region = (code: string) => regionNames.of(code) ?? code;

  return (
    <>
      <PageTitle
        aside={
          me.data?.permissions.includes("examples") && (
            <Link href="/admin/examples/matrix" data-testid="dashboard-matrix-link" className={buttonClass({ variant: "secondary", size: "sm" })}>
              <Grid3x3 className="size-4" />
              {t("admin.matrix.title")}
            </Link>
          )
        }
      >
        {t("admin.dashboard.title")}
      </PageTitle>

      <section
        data-testid="pause-card"
        data-paused={s.paused}
        className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${
          s.paused ? "border-danger/40 bg-danger/10" : "border-border bg-card"
        }`}
      >
        <div>
          <p className="font-bold">{s.paused ? t("admin.dashboard.paused") : t("admin.dashboard.running")}</p>
          <p className="text-sm text-muted">
            {s.paused ? t("admin.dashboard.paused.text") : t("admin.dashboard.running.text")}
          </p>
        </div>
        <Button
          variant={s.paused ? "success" : "danger"}
          data-testid="pause-toggle"
          loading={pause.isPending}
          icon={s.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          onClick={() => pause.mutate(!s.paused)}
        >
          {s.paused ? t("admin.dashboard.resume") : t("admin.dashboard.pause")}
        </Button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("admin.dashboard.booksToday")}
          value={number(s.books.today)}
          hint={t("admin.dashboard.total", { count: number(s.books.total) })}
          testId="stat-books-today"
        />
        <Stat label={t("admin.dashboard.success")} value={success} hint={t("admin.dashboard.failed", { count: number(s.books.byStatus.failed ?? 0) })} />
        <Stat label={t("admin.dashboard.time")} value={avg} hint={t("admin.dashboard.time.hint")} />
        <Stat label={t("admin.dashboard.spend")} value={formatSpendUsd(s.spend.totalUsd)} hint={t("admin.dashboard.spend.today", { amount: formatSpendUsd(s.spend.todayUsd) })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("admin.dashboard.limits")}>
          <Meter label={t("admin.dashboard.limits.budget")} used={s.spend.totalUsd} limit={s.spend.budgetUsd} format={formatSpendUsd} />
          <Meter label={t("admin.dashboard.limits.regular")} used={s.caps.regular.used} limit={s.caps.regular.limit} />
          <Meter label={t("admin.dashboard.limits.demo")} used={s.caps.demo.used} limit={s.caps.demo.limit} />
        </Card>
        <Card title={t("admin.dashboard.sales")} data-testid="sales">
          <p className="-mt-2 text-xs text-muted">{t("admin.dashboard.sales.byCurrency")}</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted">{t("admin.dashboard.sales.purchases")}</p>
              <p className="text-2xl font-extrabold tabular-nums">{number(s.sales.purchases.books)}</p>
              <RevenueLines revenue={s.sales.purchases} testId="revenue-purchases" />
            </div>
            <div>
              <p className="text-sm text-muted">{t("admin.dashboard.sales.orders")}</p>
              <p className="text-2xl font-extrabold tabular-nums">{number(s.sales.orders.count)}</p>
              <RevenueLines revenue={s.sales.orders} testId="revenue-orders" />
            </div>
          </div>
          <p data-testid="revenue-total-usd" data-amount={s.sales.approxUsd.amount} className="text-sm font-bold">
            {t("admin.dashboard.sales.approx", { amount: money(s.sales.approxUsd) })}
          </p>
        </Card>
        <Card title={t("admin.dashboard.countries")}>
          <Bars rows={s.countries.map((c) => ({ label: region(c.country), value: c.books }))} />
        </Card>
        <Card title={t("admin.dashboard.templates")}>
          <Bars rows={s.templates.map((t) => ({ label: t.title, value: t.books }))} />
        </Card>
        <StaffSpend rows={s.staffSpend} />
        <Card title={t("admin.dashboard.printInterest")}>
          <Bars
            rows={s.printInterest.map((p) => ({
              label: p.country ? region(p.country) : t("admin.dashboard.unknownCountry"),
              value: p.requests,
            }))}
          />
        </Card>
      </div>
    </>
  );
}
