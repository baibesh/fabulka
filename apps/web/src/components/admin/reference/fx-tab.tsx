"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RateSchema, type AdminFx, type FxRateRow } from "@fabulka/shared";
import { RefreshCw, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { adminFx, clearFxRate, refreshFx, saveFxRate } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { errorText, useCurrencyLabel } from "./shared";

const FX_QUERY = ["admin", "fx"];

/**
 * Exchange rates to USD, for reports only (approximate dollar totals on the dashboards): the rate
 * each currency records now, where it came from, the last fetched one, and the superadmin's override.
 */
export function FxTab() {
  const { t, date } = useAdminI18n();
  const queryClient = useQueryClient();
  const fx = useQuery({ queryKey: FX_QUERY, queryFn: adminFx });
  const refresh = useMutation({
    mutationFn: refreshFx,
    onSuccess: (data) => queryClient.setQueryData(FX_QUERY, data),
  });
  if (!fx.data) return <QueryState error={fx.error} scope="admin" />;
  const { rates, refresh: last } = fx.data;
  return (
    <div data-testid="reference-fx" className="flex flex-col gap-4">
      <Notice>{t("admin.reference.fx.hint")}</Notice>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span data-testid="fx-last-refresh">
            {!last.enabled ? t("admin.reference.fx.off") : last.at ? t("admin.reference.fx.lastRefresh", { date: date(last.at) }) : null}
            {last.ok === false && last.error && <span className={`block ${errorText}`}>{t("admin.reference.fx.refreshFailed", { error: last.error })}</span>}
          </span>
          <Button variant="secondary" size="sm" data-testid="fx-refresh" loading={refresh.isPending} icon={<RefreshCw className="size-4" />} onClick={() => refresh.mutate()}>
            {t("admin.reference.fx.refresh")}
          </Button>
        </div>
        <ul className="flex flex-col gap-3">
          {rates.map((row) => (
            <RateRow key={row.currency} row={row} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function RateRow({ row }: { row: FxRateRow }) {
  const { t } = useAdminI18n();
  const label = useCurrencyLabel();
  const queryClient = useQueryClient();
  const [rate, setRate] = useState(row.manual ?? "");
  const [invalid, setInvalid] = useState(false);
  const done = (data: AdminFx) => queryClient.setQueryData(FX_QUERY, data);
  const save = useMutation({
    mutationFn: async () => {
      const parsed = RateSchema.safeParse(rate.replace(",", "."));
      setInvalid(!parsed.success);
      return parsed.success ? saveFxRate(row.currency, parsed.data) : null;
    },
    onSuccess: (data) => data && done(data),
  });
  const clear = useMutation({
    mutationFn: () => clearFxRate(row.currency),
    onSuccess: (data) => {
      setRate("");
      done(data);
    },
  });
  if (row.currency === "USD") {
    return (
      <li data-testid="fx-row" data-currency="USD" className="flex justify-between gap-3 rounded-xl bg-background p-3 text-sm">
        <span className="font-semibold">{label("USD")}</span>
        <span className="text-muted">{t("admin.reference.fx.base")}</span>
      </li>
    );
  }
  return (
    <li data-testid="fx-row" data-currency={row.currency} data-rate={row.rate ?? ""} data-source={row.source ?? ""} className="flex flex-col gap-2 rounded-xl bg-background p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-semibold">{label(row.currency)}</span>
        <span className="tabular-nums">
          {row.rate ? `${t("admin.reference.fx.rate")}${row.rate}` : t("admin.reference.fx.none")}
          {row.source && <span className="ml-2 text-muted">· {t(`admin.reference.fx.source.${row.source}`)}{row.date ? `, ${row.date}` : ""}</span>}
        </span>
      </div>
      {row.fetched && row.manual && (
        <span className="text-xs text-muted">{t("admin.reference.fx.fetched", { rate: row.fetched.rate, date: row.fetched.date })}</span>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <span className="text-muted">{t("admin.reference.fx.manual")}</span>
        <Input data-testid="fx-manual" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="w-40" />
        <Button type="submit" size="sm" data-testid="fx-set" loading={save.isPending} icon={<Save className="size-4" />}>
          {t("admin.reference.fx.set")}
        </Button>
        {row.manual && (
          <Button variant="ghost" size="sm" data-testid="fx-clear" loading={clear.isPending} icon={<RotateCcw className="size-4" />} onClick={() => clear.mutate()}>
            {t("admin.reference.fx.clear")}
          </Button>
        )}
        {invalid && (
          <span data-testid="reference-error" className={errorText}>
            {t("admin.reference.error.rate")}
          </span>
        )}
        {save.error && <span className={errorText}>{save.error.message}</span>}
      </form>
    </li>
  );
}
