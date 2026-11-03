"use client";

import { useMutation } from "@tanstack/react-query";
import {
  CURRENCIES,
  CountryFormatOverridesSchema,
  SCOPE_FORBIDDEN,
  countryInfo,
  formatName,
  money,
  toInputString,
  type AdminReference,
  type CountryFormatOverrides,
  type Currency,
} from "@fabulka/shared";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { clearCountryFormats, saveCountryFormats } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { parsePrice, SaveBar, useCurrencyLabel, usePriceError, useSaved } from "./shared";

/**
 * One format in the form: offered or not, its cover prices as typed in the country's currency (empty:
 * the format's price in that currency), and the print partner's cost per copy (empty: not set).
 */
type Draft = { published: boolean; soft: string; hard: string; costCurrency: Currency; costSoft: string; costHard: string };

const COVERS = ["soft", "hard"] as const;
const text = (amount: number, currency: Currency) => toInputString(money(amount, currency));

/**
 * The working country's print formats: which of the global formats it offers, its cover prices in
 * its currency, and the print partner's cost per copy (any currency) for the margin. Sizes, bleed
 * and ids are global (the superadmin's Formats tab with "All countries").
 */
export function CountryFormatsTab({ reference, country }: { reference: AdminReference; country: string }) {
  const { t, locale, money: format } = useAdminI18n();
  const saved = useSaved();
  const label = useCurrencyLabel();
  const priceError = usePriceError();
  const { currency } = countryInfo(country, reference.countries);
  const own = reference.countryFormats[country];
  const initial = () =>
    Object.fromEntries(
      reference.formats.map((f) => {
        const o = own?.[f.id];
        const prices = o?.prices?.currency === currency ? o.prices : undefined;
        return [
          f.id,
          {
            published: o?.published ?? f.published,
            soft: prices ? text(prices.soft, currency) : "",
            hard: prices ? text(prices.hard, currency) : "",
            costCurrency: o?.cost?.currency ?? currency,
            costSoft: o?.cost ? text(o.cost.soft, o.cost.currency) : "",
            costHard: o?.cost ? text(o.cost.hard, o.cost.currency) : "",
          } satisfies Draft,
        ];
      }),
    );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [bad, setBad] = useState<Set<string>>(new Set());
  const save = useMutation({
    mutationFn: async () => {
      // Only what differs from the global format is the country's own.
      const overrides: CountryFormatOverrides = {};
      const problems = new Set<string>();
      for (const f of reference.formats) {
        const d = drafts[f.id];
        const entry: CountryFormatOverrides[string] = {};
        if (d.published !== f.published) entry.published = d.published;
        const defaults = f.prices[currency];
        if (d.soft.trim() || d.hard.trim()) {
          const soft = d.soft.trim() ? parsePrice(d.soft, currency, 1) : (defaults?.soft ?? null);
          const hard = d.hard.trim() ? parsePrice(d.hard, currency, 1) : (defaults?.hard ?? null);
          if (soft === null) problems.add(`${f.id}.soft`);
          if (hard === null) problems.add(`${f.id}.hard`);
          if (soft !== null && hard !== null) entry.prices = { currency, soft, hard };
        }
        if (d.costSoft.trim() || d.costHard.trim()) {
          const soft = parsePrice(d.costSoft, d.costCurrency);
          const hard = parsePrice(d.costHard, d.costCurrency);
          if (soft === null) problems.add(`${f.id}.costSoft`);
          if (hard === null) problems.add(`${f.id}.costHard`);
          if (soft !== null && hard !== null) entry.cost = { currency: d.costCurrency, soft, hard };
        }
        if (Object.keys(entry).length) overrides[f.id] = entry;
      }
      const parsed = CountryFormatOverridesSchema.safeParse(overrides);
      setBad(problems);
      return parsed.success && !problems.size ? saveCountryFormats(country, parsed.data) : null;
    },
    onSuccess: (formats) => {
      if (formats) saved({ countryFormats: { ...reference.countryFormats, [country]: formats } });
    },
  });
  const reset = useMutation({
    mutationFn: () => clearCountryFormats(country),
    onSuccess: () => {
      const rest = { ...reference.countryFormats };
      delete rest[country];
      saved({ countryFormats: rest });
      setDrafts(
        Object.fromEntries(
          reference.formats.map((f) => [f.id, { published: f.published, soft: "", hard: "", costCurrency: currency, costSoft: "", costHard: "" }]),
        ),
      );
      save.reset();
    },
  });
  const failure = save.error instanceof ApiError && save.error.code === SCOPE_FORBIDDEN ? new Error(t("admin.scope.forbidden")) : save.error;
  const set = (id: string, patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

  return (
    <form
      data-testid="reference-country-formats"
      data-country={country}
      data-currency={currency}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <Badge data-testid="country-formats-own" data-own={own ? "true" : "false"} tone={own ? "success" : "neutral"} className="self-start">
        {own ? t("admin.reference.countryFormats.own") : t("admin.reference.countryFormats.global")}
      </Badge>
      <Card>
        <p className="text-sm text-muted">{t("admin.reference.countryFormats.hint")}</p>
        <p className="text-sm font-semibold">{t("admin.reference.prices.in", { currency: label(currency) })}</p>
        <ul className="flex flex-col gap-3">
          {reference.formats.map((f) => {
            const d = drafts[f.id];
            const defaults = f.prices[currency];
            // The margin per copy, when the partner's cost is in the country's currency.
            const price = (cover: "soft" | "hard") => parsePrice(d[cover], currency, 1) ?? defaults?.[cover] ?? null;
            const cost = (cover: "soft" | "hard") => parsePrice(cover === "soft" ? d.costSoft : d.costHard, d.costCurrency);
            const margin =
              d.costCurrency === currency && cost("soft") !== null && cost("hard") !== null && price("soft") !== null && price("hard") !== null
                ? { soft: format(money(price("soft")! - cost("soft")!, currency)), hard: format(money(price("hard")! - cost("hard")!, currency)) }
                : null;
            return (
              <li key={f.id} data-testid={`country-format-${f.id}`} className="flex flex-col gap-3 rounded-xl bg-background p-3">
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_8rem]">
                  <ChoiceLabel strong>
                    <Checkbox data-testid={`country-format-offered-${f.id}`} checked={d.published} onChange={(e) => set(f.id, { published: e.target.checked })} />
                    {formatName(f, locale)}
                    <span className="text-xs font-normal text-muted">
                      {f.widthMm}×{f.heightMm}
                    </span>
                    {!defaults && !d.soft && (
                      <span data-testid={`country-format-unpriced-${f.id}`} className="text-xs font-normal text-danger">
                        {t("admin.reference.countryFormats.unpriced", { currency })}
                      </span>
                    )}
                  </ChoiceLabel>
                  {COVERS.map((cover) => (
                    <Field
                      key={cover}
                      label={t(cover === "soft" ? "admin.reference.cover.soft" : "admin.reference.cover.hard")}
                      error={bad.has(`${f.id}.${cover}`) && priceError(currency)}
                      errorTestId="reference-error"
                    >
                      <Input
                        data-testid={`country-format-${cover}-${f.id}`}
                        inputMode="decimal"
                        placeholder={defaults ? format(money(defaults[cover], currency)) : ""}
                        value={d[cover]}
                        onChange={(e) => set(f.id, { [cover]: e.target.value })}
                      />
                    </Field>
                  ))}
                </div>
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_8rem_8rem]">
                  <span className="text-xs text-muted">
                    {t("admin.reference.cost.title")}
                    {margin && (
                      <span data-testid={`country-format-margin-${f.id}`} className="block text-success">
                        {t("admin.reference.cost.margin", margin)}
                      </span>
                    )}
                  </span>
                  <Field label={t("admin.reference.cost.currency")}>
                    <Select data-testid={`country-format-cost-currency-${f.id}`} value={d.costCurrency} onChange={(e) => set(f.id, { costCurrency: e.target.value as Currency })}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {(["costSoft", "costHard"] as const).map((field) => (
                    <Field
                      key={field}
                      label={t(field === "costSoft" ? "admin.reference.cost.soft" : "admin.reference.cost.hard")}
                      error={bad.has(`${f.id}.${field}`) && t("admin.reference.error.fee", { currency: d.costCurrency })}
                      errorTestId="reference-error"
                    >
                      <Input data-testid={`country-format-${field === "costSoft" ? "cost-soft" : "cost-hard"}-${f.id}`} inputMode="decimal" value={d[field]} onChange={(e) => set(f.id, { [field]: e.target.value })} />
                    </Field>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SaveBar testId="country-formats-save" pending={save.isPending} saved={save.isSuccess && save.data !== null} error={failure} problems={bad.size > 0} />
        {own && (
          <Button variant="ghost" data-testid="country-formats-reset" loading={reset.isPending} icon={<RotateCcw className="size-4" />} onClick={() => reset.mutate()}>
            {t("admin.reference.countryFormats.reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
