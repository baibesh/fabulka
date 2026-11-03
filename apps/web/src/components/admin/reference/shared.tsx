"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CURRENCY_REGISTRY, parseMoneyInput, priceStep, type AdminReference, type Currency } from "@fabulka/shared";
import { intlLocale } from "@/i18n/format";
import { ArrowDown, ArrowUp, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { useAdminI18n } from "../ui";

export const QUERY = ["admin", "reference"];

/** Keys that stay put while rows move, shared by every list on the page. */
let lastKey = 0;
export const nextKey = () => lastKey++;

/** The small red line under a field or a row. */
export const errorText = "text-sm font-normal text-danger";

/** Puts a saved part into the admin's copy and makes the site load the new prices, countries and cities. */
export function useSaved() {
  const queryClient = useQueryClient();
  return (patch: Partial<AdminReference>) => {
    queryClient.setQueryData<AdminReference>(QUERY, (old) => (old ? { ...old, ...patch } : old));
    void queryClient.invalidateQueries({ queryKey: ["reference"] });
  };
}

/** Issues by path ("books.template.KZT", "3.ru"), first one per path. */
export function issuesByPath(issues: { path: PropertyKey[]; code: string }[]) {
  const byPath: Record<string, string> = {};
  for (const issue of issues) byPath[issue.path.join(".")] ??= issue.code;
  return byPath;
}

/**
 * The rows of an editable list and the problems found in them. Problems point at row indexes, so
 * moving or removing a row clears them.
 */
export function useRows<T>(initial: () => T[]) {
  const [rows, setRows] = useState(initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
  return {
    rows,
    setRows,
    problems,
    setProblems,
    update: (index: number, patch: (row: T) => Partial<T>) =>
      setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch(row) } : row))),
    move: (index: number, by: -1 | 1) => {
      setRows((list) => {
        const next = [...list];
        [next[index], next[index + by]] = [next[index + by], next[index]];
        return next;
      });
      setProblems({});
    },
    remove: (index: number) => {
      setRows((list) => list.filter((_, j) => j !== index));
      setProblems({});
    },
  };
}

/** Save, then «Сохранено», «Проверьте поля» or the API's error beside it. */
export function SaveBar({
  testId = "reference-save",
  pending,
  saved,
  error,
  problems,
}: {
  testId?: string;
  pending: boolean;
  saved: boolean;
  error: Error | null;
  problems: boolean;
}) {
  const { t } = useAdminI18n();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" data-testid={testId} loading={pending} icon={<Save className="size-4" />}>
        {t("admin.save")}
      </Button>
      {saved && (
        <span data-testid="reference-saved" className="text-sm text-success">
          {t("admin.saved")}
        </span>
      )}
      {problems && (
        <span role="alert" data-testid="reference-problems" className="text-sm text-danger">
          {t("admin.reference.check")}
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error.message}
        </span>
      )}
    </div>
  );
}

/** Up, down and remove for one row of a list; test ids are `${prefix}-up`, `-down`, `-remove`. */
export function RowActions({
  prefix,
  index,
  count,
  labels,
  onMove,
  onRemove,
}: {
  prefix: string;
  index: number;
  count: number;
  labels: { up: string; down: string; remove: string };
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-1">
      <IconButton data-testid={`${prefix}-up`} label={labels.up} disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp className="size-4" />
      </IconButton>
      <IconButton data-testid={`${prefix}-down`} label={labels.down} disabled={index === count - 1} onClick={() => onMove(1)}>
        <ArrowDown className="size-4" />
      </IconButton>
      <IconButton data-testid={`${prefix}-remove`} variant="danger" label={labels.remove} onClick={onRemove}>
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  );
}

/**
 * A price an admin typed, in minor units of `currency` (whole tenge, cents: parseMoneyInput), at
 * least `minSteps` of the currency's smallest price step; null when it is not one.
 */
export function parsePrice(text: string, currency: Currency, minSteps = 0): number | null {
  const parsed = parseMoneyInput(text, currency);
  return parsed && parsed.amount >= minSteps * priceStep(currency) ? parsed.amount : null;
}

/** A currency as the admin names it: "Tenge (KZT, ₸)" in the admin's language. */
export function useCurrencyLabel() {
  const { locale } = useAdminI18n();
  const names = new Intl.DisplayNames([intlLocale(locale)], { type: "currency" });
  return (currency: Currency) => {
    const name = names.of(currency) ?? currency;
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} (${currency}, ${CURRENCY_REGISTRY[currency].symbol})`;
  };
}

/** The line under a bad price: what a price in this currency looks like. */
export function usePriceError() {
  const { t } = useAdminI18n();
  return (currency: Currency) =>
    t("admin.reference.error.price", {
      currency,
      rule: t(CURRENCY_REGISTRY[currency].decimals ? "admin.reference.error.price.cents" : "admin.reference.error.price.whole"),
    });
}
