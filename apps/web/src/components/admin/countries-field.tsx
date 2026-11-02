"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { adminReference } from "@/lib/admin-api";
import { useCountryName } from "@/hooks/use-country-name";
import { FlagChips } from "./chips";
import { QUERY as REFERENCE_QUERY } from "./reference/shared";
import { useAdminI18n } from "./ui";

/**
 * Countries staff limit something to: chips of countries the site offers (reference.countries, less
 * the blocked ones), with their flags as the site's country picker shows them. `empty` says what an
 * empty list means. Test ids: `testId` on the fieldset (with data-value and data-loaded), and
 * `chipTestId` as FlagChips' prefix.
 */
export function CountriesField({
  testId,
  chipTestId,
  label,
  hint,
  empty,
  value,
  onChange,
}: {
  testId: string;
  chipTestId: string;
  label: string;
  hint: string;
  empty: ReactNode;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const reference = useQuery({ queryKey: REFERENCE_QUERY, queryFn: adminReference });
  const blocked = new Set([...(reference.data?.blocked.meta.map((c) => c.code) ?? []), ...(reference.data?.blocked.extra ?? [])]);
  const offered = reference.data?.countries.map((c) => c.code).filter((code) => !blocked.has(code)) ?? [];
  return (
    <fieldset data-testid={testId} data-value={value.join(" ")} data-loaded={reference.data ? "true" : "false"} className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {value.length === 0 && empty}
        <FlagChips
          testId={chipTestId}
          values={value}
          options={offered}
          name={(code) => countryName(code)}
          flag={(code) => code}
          addLabel={t("admin.template.countries.add")}
          removeLabel={(country) => t("admin.template.countries.remove", { country })}
          onAdd={(code) => onChange([...value, code])}
          onRemove={(code) => onChange(value.filter((c) => c !== code))}
          menuClassName="max-h-72 w-64 overflow-y-auto"
        />
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </fieldset>
  );
}
