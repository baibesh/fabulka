"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STAFF_CAP_REACHED, StaffBudgetSchema } from "@fabulka/shared";
import { Wallet } from "lucide-react";
import { Notice } from "@/components/ui/notice";
import { useCountryName } from "@/hooks/use-country-name";
import { myBudget } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { formatSpendUsd, useAdminI18n } from "./ui";

/** Budget queries: one per country an action is for ("none": an action for no country). */
export const budgetQuery = (country: string | null) => ["admin", "budget", country ?? "none"] as const;

/** Refetch every budget after a paid action (or its refusal). */
export function useRefreshBudget() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["admin", "budget"] });
}

/**
 * What the signed-in person may still spend today on staff generation (translations, theme
 * proposals) for an action in `country`: shown where those actions are. Nothing caps a superadmin
 * by default, which it says too.
 */
export function StaffBudgetNote({ country }: { country: string | null }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const budget = useQuery({ queryKey: budgetQuery(country), queryFn: () => myBudget(country) });
  const b = budget.data;
  if (!b) return null;
  if (b.remainingUsd === null) {
    return (
      <p data-testid="staff-budget" data-remaining="none" data-allowed="true" className="flex items-center gap-2 text-sm text-muted">
        <Wallet className="size-4" />
        {t("admin.caps.unlimited")}
      </p>
    );
  }
  const lines = [
    b.person.capUsd !== null ? t("admin.caps.budget.person", { spent: formatSpendUsd(b.person.spentUsd), cap: formatSpendUsd(b.person.capUsd) }) : null,
    b.country?.capUsd != null
      ? t("admin.caps.budget.country", { country: countryName(b.country.code), spent: formatSpendUsd(b.country.spentUsd), cap: formatSpendUsd(b.country.capUsd) })
      : null,
  ].filter(Boolean);
  return (
    <Notice
      size="sm"
      tone={b.allowed ? "subtle" : "warning"}
      icon={<Wallet className="size-4 shrink-0" />}
      data-testid="staff-budget"
      data-remaining={b.remainingUsd}
      data-allowed={b.allowed ? "true" : "false"}
    >
      <span className="font-semibold">{t("admin.caps.budget", { left: formatSpendUsd(b.remainingUsd) })}</span>
      {lines.length > 0 && <span className="text-xs text-muted">{lines.join(" · ")}</span>}
    </Notice>
  );
}

/** A refusal for a spent daily cap in the admin's words (with what is left), else null. */
export function useCapError() {
  const { t } = useAdminI18n();
  return (error: Error | null): string | null => {
    if (!(error instanceof ApiError) || error.code !== STAFF_CAP_REACHED) return null;
    const budget = StaffBudgetSchema.safeParse((error.body as { budget?: unknown } | undefined)?.budget).data;
    return t("admin.caps.reached", { left: formatSpendUsd(budget?.remainingUsd ?? 0) });
  };
}
