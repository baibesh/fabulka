"use client";

import { useQuery } from "@tanstack/react-query";
import type { CountriesMode } from "@fabulka/shared";
import type { ReactNode } from "react";
import { adminReference } from "@/lib/admin-api";
import { useCountryName } from "@/hooks/use-country-name";
import { cx } from "@/components/ui/cx";
import { FlagChips } from "./chips";
import { QUERY as REFERENCE_QUERY } from "./reference/shared";
import { useAdminI18n } from "./ui";
import { NotOffered } from "./not-offered";

/**
 * Countries staff limit something to: chips of countries the site offers (reference.countries, less
 * the blocked ones), with their flags as the site's country picker shows them. `empty` says what an
 * empty list means. With `onModeChange`, a toggle says whether the list names the only countries it
 * shows in or the ones it does not ("everywhere except…"). `allowed` narrows the countries that may
 * be added (a country manager's own); `disabled` shows the value read-only. Test ids: `testId` on
 * the fieldset (with data-value, data-mode and data-loaded), `chipTestId` as FlagChips' prefix, and
 * `${testId}-mode-include` / `-mode-exclude` on the toggle.
 */
export function CountriesField({
  testId,
  chipTestId,
  label,
  hint,
  empty,
  value,
  onChange,
  mode = "include",
  onModeChange,
  allowed,
  disabled = false,
}: {
  testId: string;
  chipTestId: string;
  label: string;
  hint: string;
  empty: ReactNode;
  value: string[];
  onChange: (next: string[]) => void;
  mode?: CountriesMode;
  onModeChange?: (mode: CountriesMode) => void;
  allowed?: readonly string[];
  disabled?: boolean;
}) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const reference = useQuery({ queryKey: REFERENCE_QUERY, queryFn: adminReference });
  const blocked = new Set([...(reference.data?.blocked.meta.map((c) => c.code) ?? []), ...(reference.data?.blocked.extra ?? [])]);
  const offered = reference.data?.countries.map((c) => c.code).filter((code) => !blocked.has(code) && (!allowed || allowed.includes(code))) ?? [];
  return (
    <fieldset
      data-testid={testId}
      data-value={value.join(" ")}
      data-mode={mode}
      data-loaded={reference.data ? "true" : "false"}
      disabled={disabled}
      className="flex flex-col gap-1.5"
    >
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      {onModeChange && (
        <div role="radiogroup" aria-label={label} className="mb-1 flex w-fit overflow-hidden rounded-full border border-border text-sm">
          {(["include", "exclude"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              data-testid={`${testId}-mode-${m}`}
              onClick={() => mode !== m && onModeChange(m)}
              className={cx("px-3 py-1 font-semibold disabled:opacity-60", mode === m ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground")}
            >
              {t(m === "include" ? "admin.countries.mode.include" : "admin.countries.mode.exclude")}
            </button>
          ))}
        </div>
      )}
      <div className={cx("flex flex-wrap items-center gap-2", disabled && "pointer-events-none opacity-70")}>
        {value.length === 0 && empty}
        <FlagChips
          testId={chipTestId}
          values={value}
          options={disabled ? [] : offered}
          name={(code) => countryName(code)}
          flag={(code) => code}
          addLabel={t("admin.template.countries.add")}
          removeLabel={(country) => t("admin.template.countries.remove", { country })}
          onAdd={(code) => onChange([...value, code])}
          onRemove={(code) => onChange(value.filter((c) => c !== code))}
          extra={(code) => <NotOffered code={code} />}
          menuClassName="max-h-72 w-64 overflow-y-auto"
        />
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </fieldset>
  );
}
