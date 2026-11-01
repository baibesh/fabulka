"use client";

import { OTHER_COUNTRY, type Country, type Language } from "@fabulka/shared";
import { Check, Search } from "lucide-react";
import { useState } from "react";
import { setCountry, setLocale, useI18n } from "@/i18n/i18n";
import { LOCALE_NAMES, UI_LOCALES } from "@/i18n/messages";
import { LANGUAGE_FLAGS, languageCode, regionName } from "@/lib/regions";
import { Flag } from "./flag";
import { Modal } from "./modal";

const option =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-semibold hover:bg-accent/10 aria-[current=true]:bg-accent/15 aria-[current=true]:text-accent";

/** The country's name in the interface language; "other" is «Другая страна». */
function useCountryName() {
  const { t, locale } = useI18n();
  return (country: Country) => (country === OTHER_COUNTRY ? t("country.other") : regionName(country, locale));
}

/** Header button: the flag of the interface language; opens the languages the country offers. */
export function LanguagePicker() {
  const { t, locale, country, info } = useI18n();
  const countryName = useCountryName();
  const [open, setOpen] = useState(false);
  const choose = (language: Language) => {
    setLocale(language);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        data-testid="ui-language"
        aria-haspopup="dialog"
        aria-label={`${t("nav.language")}: ${LOCALE_NAMES[locale]}`}
        title={t("nav.language")}
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm font-semibold text-muted hover:text-foreground sm:px-2"
      >
        <Flag code={LANGUAGE_FLAGS[locale]} className="text-base" />
        <span>{languageCode(locale)}</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        testId="ui-language-dialog"
        title={t("nav.language.choose")}
        description={t("nav.language.hint", { country: countryName(country) })}
        closeLabel={t("auth.error.close")}
      >
        <ul className="flex flex-col gap-1">
          {info.languages.map((language) => (
            <li key={language}>
              <button
                type="button"
                data-testid={`ui-language-option-${language}`}
                aria-current={language === locale}
                data-autofocus={language === locale ? "" : undefined}
                onClick={() => choose(language)}
                className={option}
              >
                <Flag code={LANGUAGE_FLAGS[language]} className="text-lg" />
                <span className="flex-1">{LOCALE_NAMES[language]}</span>
                {language === locale && <Check className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

const normalize = (text: string) => text.toLocaleLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Footer button: the visitor's country; opens the countries the site offers, with a search. */
export function CountryPicker() {
  const { t, country, countries } = useI18n();
  const countryName = useCountryName();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (code: Country) => {
    setCountry(code);
    close();
  };
  // Found by its name in any interface language or by its code, whatever language is on screen.
  const wanted = normalize(query.trim());
  const found = countries.filter(
    ({ code }) => !wanted || code.toLowerCase() === wanted || UI_LOCALES.some((l) => normalize(regionName(code, l)).includes(wanted)),
  );

  const row = (code: Country) => (
    <li key={code}>
      <button
        type="button"
        data-testid={`ui-country-option-${code}`}
        aria-current={code === country}
        onClick={() => choose(code)}
        className={option}
      >
        <Flag code={code} className="text-lg" />
        <span className="flex-1">{countryName(code)}</span>
        {code === country && <Check className="size-4" />}
      </button>
    </li>
  );

  return (
    <>
      <button
        type="button"
        data-testid="ui-country"
        aria-haspopup="dialog"
        aria-label={`${t("nav.country")}: ${countryName(country)}`}
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 font-semibold hover:border-accent hover:text-foreground"
      >
        <Flag code={country} className="text-base" />
        {countryName(country)}
      </button>
      <Modal open={open} onClose={close} testId="ui-country-dialog" title={t("nav.country.choose")} description={t("nav.country.hint")} closeLabel={t("auth.error.close")}>
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted" />
          <input
            type="search"
            data-testid="ui-country-search"
            data-autofocus=""
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("nav.country.search")}
            placeholder={t("nav.country.search")}
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-background py-2.5 pr-3 pl-9 outline-none focus:border-accent"
          />
        </label>
        <ul data-testid="ui-country-list" className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1">
          {found.map(({ code }) => row(code))}
          {found.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t("nav.country.empty")}</li>}
          {/* Always at the end: everyone the list leaves out. */}
          <li aria-hidden className="my-1 border-t border-border" />
          {row(OTHER_COUNTRY)}
        </ul>
      </Modal>
    </>
  );
}
