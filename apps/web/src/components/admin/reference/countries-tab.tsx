"use client";

import { useMutation } from "@tanstack/react-query";
import {
  COUNTRY_BLOCKED,
  COUNTRY_POLICY_BLOCKED,
  CURRENCIES,
  CountriesSchema,
  ISO_COUNTRY_CODES,
  LIVE_PAYMENT_PROVIDERS,
  PAYMENT_PROVIDERS,
  LANGUAGES,
  LANGUAGE_NAMES,
  inLanguageOrder,
  suggestedCountry,
  type BlockedCountries,
  type DefaultPrices,
  type CountryEntry,
  type Language,
} from "@fabulka/shared";
import { Plus, Star } from "lucide-react";
import { useState } from "react";
import { Flag } from "@/components/ui/flag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { cx } from "@/components/ui/cx";
import { Select } from "@/components/ui/input";
import { useCountryName } from "@/hooks/use-country-name";
import { intlLocale } from "@/i18n/format";
import { saveCountries } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { LANGUAGE_FLAGS } from "@/lib/regions";
import { FlagChips } from "../chips";
import { Card, useAdminI18n } from "../ui";
import { errorText, issuesByPath, nextKey, RowActions, SaveBar, useRows, useSaved } from "./shared";

/** A country in the form, with a key that stays put while rows move. */
type CountryDraft = CountryEntry & { key: number };
const withKey = (country: CountryEntry): CountryDraft => ({ ...country, key: nextKey() });

/** The countries the site offers, in the order the picker lists them: languages, currency, print. */
export function CountriesTab({ initial, blocked, prices }: { initial: CountryEntry[]; blocked: BlockedCountries; prices: DefaultPrices }) {
  const { t, locale, money } = useAdminI18n();
  const countryName = useCountryName("admin");
  const saved = useSaved();
  const { rows, setRows, problems, setProblems, update, move, remove } = useRows(() => initial.map(withKey));
  const [pick, setPick] = useState("");
  const meta = new Set(blocked.meta.map((c) => c.code));
  const extra = new Set(blocked.extra);
  // Only countries that may be offered: never one on Meta's list or the owner's.
  const available = ISO_COUNTRY_CODES.filter((code) => !meta.has(code) && !extra.has(code) && !rows.some((row) => row.code === code))
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, intlLocale(locale)));
  const save = useMutation({
    mutationFn: async (next: CountryDraft[]) => {
      const parsed = CountriesSchema.safeParse(
        next.map(({ code, languages, currency, print, payment }) => ({ code, languages, currency, print, ...(payment && payment !== "manual" && { payment }) })),
      );
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? saveCountries(parsed.data) : null;
    },
    onSuccess: (countries) => {
      if (!countries) return;
      saved({ countries });
      setRows(countries.map(withKey));
    },
  });
  const refused = save.error instanceof ApiError ? save.error.code : null;
  const saveError =
    refused === COUNTRY_POLICY_BLOCKED
      ? new Error(t("admin.reference.error.countryMeta"))
      : refused === COUNTRY_BLOCKED
        ? new Error(t("admin.reference.error.countryBlocked"))
        : save.error;

  const addLanguage = (index: number, language: Language) =>
    update(index, (row) => ({ languages: row.languages.includes(language) ? row.languages : [...row.languages, language] }));
  const removeLanguage = (index: number, language: Language) =>
    update(index, (row) => ({ languages: row.languages.filter((l) => l !== language) }));
  const makeDefault = (index: number, language: Language) =>
    update(index, (row) => ({ languages: [language, ...row.languages.filter((l) => l !== language)] }));
  const add = () => {
    if (!pick) return;
    // Its own currency (priced from that currency's defaults until it gets its own) and language.
    setRows((list) => [...list, withKey(suggestedCountry(pick))]);
    setPick("");
  };

  return (
    <form
      data-testid="reference-countries"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(rows);
      }}
      className="flex flex-col gap-4"
    >
      <Card>
        <p className="text-sm text-muted">{t("admin.reference.countries.hint")}</p>
        {problems[""] && <p className={errorText}>{t("admin.reference.error.countriesEmpty")}</p>}
        <ol className="flex flex-col gap-3">
          {rows.map((country, i) => {
            const name = countryName(country.code);
            const isBlocked = meta.has(country.code) || extra.has(country.code);
            return (
              <li key={country.key} data-testid="country-row" data-code={country.code} className="flex flex-col gap-3 rounded-xl bg-background p-3 lg:flex-row lg:items-center">
                <span className="hidden w-6 text-right text-sm font-bold text-muted lg:block">{i + 1}</span>
                <div className="flex min-w-48 items-center gap-2 font-semibold">
                  <Flag code={country.code} className="text-lg" />
                  <span>{name}</span>
                  <span className="font-mono text-xs font-bold text-muted">{country.code}</span>
                </div>
                <fieldset className="flex flex-1 flex-col gap-1">
                  <legend className="sr-only">{t("admin.reference.country.languages")}</legend>
                  <LanguageChips
                    languages={country.languages}
                    onAdd={(language) => addLanguage(i, language)}
                    onRemove={(language) => removeLanguage(i, language)}
                    onDefault={(language) => makeDefault(i, language)}
                  />
                  {problems[`${i}.languages`] && (
                    <span data-testid="reference-error" className={errorText}>
                      {t("admin.reference.error.languages")}
                    </span>
                  )}
                  {isBlocked && (
                    <span data-testid="country-blocked" className="text-xs font-semibold text-danger">
                      {t("admin.reference.country.blocked")}
                    </span>
                  )}
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">{t("admin.reference.country.currency")}</span>
                    <Select
                      small
                      data-testid="country-currency"
                      data-value={country.currency}
                      value={country.currency}
                      onChange={(e) => update(i, () => ({ currency: e.target.value as CountryEntry["currency"] }))}
                      className="w-auto"
                    >
                      {CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {prices[country.currency] && (
                    <span data-testid="country-default-prices" className="text-xs text-muted">
                      {t("admin.reference.country.defaultPrices", {
                        template: money({ amount: prices[country.currency]!.books.template, currency: country.currency }),
                        custom: money({ amount: prices[country.currency]!.books.custom, currency: country.currency }),
                      })}
                    </span>
                  )}
                  <span className="flex flex-col gap-1">
                    <label className="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
                      <Checkbox data-testid="country-print" checked={country.print} onChange={(e) => update(i, () => ({ print: e.target.checked }))} />
                      {t("admin.reference.country.print")}
                    </label>
                  </span>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-muted">{t("admin.reference.country.payment")}</span>
                      <Select
                        small
                        data-testid="country-payment"
                        value={country.payment ?? "manual"}
                        onChange={(e) => update(i, () => ({ payment: e.target.value as CountryEntry["payment"] }))}
                        className="w-auto"
                      >
                        {PAYMENT_PROVIDERS.map((provider) => (
                          <option key={provider} value={provider}>
                            {t(`admin.reference.payment.${provider}`)}
                          </option>
                        ))}
                      </Select>
                    </span>
                    {country.payment && !LIVE_PAYMENT_PROVIDERS.includes(country.payment) && (
                      <span data-testid="country-payment-not-live" className={cx(errorText, "max-w-56")}>
                        {t("admin.reference.payment.notLive")}
                      </span>
                    )}
                  </label>
                  <RowActions
                    prefix="country"
                    index={i}
                    count={rows.length}
                    labels={{
                      up: t("admin.reference.country.up"),
                      down: t("admin.reference.country.down"),
                      remove: t("admin.reference.country.remove", { country: name }),
                    }}
                    onMove={(by) => move(i, by)}
                    onRemove={() => remove(i)}
                  />
                </div>
              </li>
            );
          })}
          <li data-testid="country-other" className="flex flex-col gap-1 rounded-xl border border-dashed border-border p-3 lg:flex-row lg:items-center lg:gap-3">
            <span className="hidden w-6 lg:block" />
            <div className="flex min-w-48 items-center gap-2 font-semibold">
              <Flag code="other" className="text-lg" />
              {t("admin.reference.other.title")}
            </div>
            <p className="text-sm text-muted">{t("admin.reference.other.text")}</p>
          </li>
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            data-testid="country-add-select"
            aria-label={t("admin.reference.country.pick")}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="max-w-sm"
          >
            <option value="">{t("admin.reference.country.pick")}</option>
            {available.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name} ({country.code})
              </option>
            ))}
          </Select>
          <Button variant="secondary" data-testid="country-add" disabled={!pick} onClick={add} icon={<Plus className="size-4" />} className="self-start">
            {t("admin.reference.country.add")}
          </Button>
        </div>
      </Card>
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={saveError} problems={Object.keys(problems).length > 0} />
    </form>
  );
}

/**
 * A country's languages as chips in the usual order (English first, Russian last); the default, kept
 * first in the list, has a filled star (the star on another chip makes that one the default), ×
 * takes a language off, and + lists the ones left.
 */
function LanguageChips({
  languages,
  onAdd,
  onRemove,
  onDefault,
}: {
  languages: Language[];
  onAdd: (language: Language) => void;
  onRemove: (language: Language) => void;
  onDefault: (language: Language) => void;
}) {
  const { t } = useAdminI18n();
  return (
    <FlagChips
      testId="country-lang"
      values={inLanguageOrder(languages)}
      options={LANGUAGES}
      name={(language) => LANGUAGE_NAMES[language]}
      flag={(language) => LANGUAGE_FLAGS[language]}
      addLabel={t("admin.reference.country.addLanguage")}
      removeLabel={(language) => t("admin.reference.country.removeLanguage", { language })}
      onAdd={onAdd}
      onRemove={onRemove}
      accent={(language) => language === languages[0]}
      extra={(language) => {
        if (language === languages[0])
          return (
            <span className="flex items-center gap-1 px-1 text-xs font-normal text-accent">
              <Star className="size-3.5 fill-current" aria-hidden />
              {t("admin.reference.country.default")}
            </span>
          );
        const makeDefaultLabel = t("admin.reference.country.makeDefault", { language: LANGUAGE_NAMES[language] });
        return (
          <button
            type="button"
            data-testid={`country-default-${language}`}
            aria-label={makeDefaultLabel}
            title={makeDefaultLabel}
            onClick={() => onDefault(language)}
            className="rounded-full p-1 text-muted hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Star className="size-3.5" aria-hidden />
          </button>
        );
      }}
    />
  );
}
