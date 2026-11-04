"use client";

import { useQuery } from "@tanstack/react-query";
import type { JournalPeriod } from "@fabulka/shared";
import { ErrorText } from "@/components/ui/notice";
import { Stat } from "@/components/ui/stat";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { journalStats } from "@/lib/admin-api";
import { formatSpendUsd, useAdminI18n } from "../ui";

/** The period at a glance: calls, error share, spend, visitors' errors, and each model's numbers. */
export function Summary({ period }: { period: JournalPeriod }) {
  const { t, number, percent, ms } = useAdminI18n();
  const stats = useQuery({ queryKey: ["admin", "journal", "stats", period], queryFn: () => journalStats(period), refetchInterval: 10_000 });
  if (stats.isError) return <ErrorText>{stats.error.message}</ErrorText>;
  const s = stats.data;
  return (
    <section data-testid="journal-summary" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label={t("admin.journal.calls")}
          value={s ? number(s.calls) : "…"}
          hint={t("admin.journal.forPeriod", { period: t(`admin.journal.period.${period}`) })}
        />
        <Stat
          label={t("admin.journal.errorShare")}
          value={s ? (s.calls ? percent(s.errors / s.calls, 1) : "-") : "…"}
          hint={s ? t("admin.journal.errors", { count: number(s.errors) }) : undefined}
        />
        <Stat label={t("admin.journal.spend")} value={s ? formatSpendUsd(s.costUsd) : "…"} />
        <Stat label={t("admin.journal.clientErrors")} value={s ? number(s.clientErrors) : "…"} />
      </div>
      <TableFrame>
        <Table>
          <thead>
            <tr>
              <th>{t("admin.journal.kind")}</th>
              <th>{t("admin.journal.model")}</th>
              <th className="text-right">{t("admin.journal.calls")}</th>
              <th className="text-right">{t("admin.journal.errorsCol")}</th>
              <th className="text-right">p50</th>
              <th className="text-right">p95</th>
              <th className="text-right">{t("admin.journal.avgCost")}</th>
            </tr>
          </thead>
          <tbody>
            {s?.byModel.map((row) => (
              <tr key={`${row.kind}/${row.model}`}>
                <td className="whitespace-nowrap">{t(`admin.journal.kind.${row.kind}`)}</td>
                <td className="text-muted">{row.model}</td>
                <td className="text-right tabular-nums">{number(row.calls)}</td>
                <td className={`text-right tabular-nums ${row.errors ? "font-bold text-danger" : "text-muted"}`}>{number(row.errors)}</td>
                <td className="text-right tabular-nums">{ms(row.p50Ms)}</td>
                <td className="text-right tabular-nums">{ms(row.p95Ms)}</td>
                <td className="text-right tabular-nums">{formatSpendUsd(row.avgCostUsd)}</td>
              </tr>
            ))}
            {s?.byModel.length === 0 && <TableEmpty colSpan={7}>{t("admin.journal.noCalls.period")}</TableEmpty>}
          </tbody>
        </Table>
      </TableFrame>
    </section>
  );
}
