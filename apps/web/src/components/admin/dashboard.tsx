"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminStats } from "@fabulka/shared";
import { Pause, Play } from "lucide-react";
import { adminStats, setPaused } from "@/lib/admin-api";
import { intlLocale } from "@/i18n/format";
import { Card, formatSpendUsd, PageTitle, useAdminI18n } from "./ui";
import { QueryState } from "@/components/ui/query-state";
import { Button } from "@/components/ui/button";

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
      <span className="text-sm text-muted">{label}</span>
      <span data-testid={testId} className="text-3xl font-extrabold tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

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

export function Dashboard() {
  const { t, locale, number, kzt, percent } = useAdminI18n();
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: adminStats, refetchInterval: 10_000 });
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
      <PageTitle>{t("admin.dashboard.title")}</PageTitle>

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
        <Card title={t("admin.dashboard.sales")}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted">{t("admin.dashboard.sales.purchases")}</p>
              <p className="text-2xl font-extrabold tabular-nums">{number(s.sales.purchases)}</p>
              <p className="text-xs text-muted">
                {kzt(s.sales.purchasesKzt)}
                {s.sales.purchasesUsd > 0 && ` · ${formatSpendUsd(s.sales.purchasesUsd)}`}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">{t("admin.dashboard.sales.orders")}</p>
              <p className="text-2xl font-extrabold tabular-nums">{number(s.sales.orders)}</p>
              <p className="text-xs text-muted">{kzt(s.sales.ordersKzt)}</p>
            </div>
          </div>
        </Card>
        <Card title={t("admin.dashboard.countries")}>
          <Bars rows={s.countries.map((c) => ({ label: region(c.country), value: c.books }))} />
        </Card>
        <Card title={t("admin.dashboard.templates")}>
          <Bars rows={s.templates.map((t) => ({ label: t.title, value: t.books }))} />
        </Card>
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
