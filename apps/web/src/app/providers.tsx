"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LocaleContext, countryChosen, isLocale, migrateSettings, setCountry, setCountryList, setLocale, useI18n } from "@/i18n/i18n";
import type { UiLocale } from "@/i18n/messages";
import { whereAmI } from "@/lib/api";
import { installErrorReporting } from "@/lib/telemetry";
import { useReference } from "@/lib/use-price";

/** `locale` is the site page's language (from its address); the admin and the global 404 pass none. */
export function Providers({ locale = null, children }: { locale?: UiLocale | null; children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());

  // Errors visitors run into go to the admin's journal (message and page only, no form values).
  useEffect(() => installErrorReporting(), []);

  // The admin's language can come with a link (/admin?lang=en) and sticks, like its switch. The
  // site's ?lang= links never get here: the proxy redirects them to the language's address.
  useEffect(() => {
    if (locale) return;
    const lang = new URLSearchParams(window.location.search).get("lang");
    if (isLocale(lang)) setLocale(lang);
  }, [locale]);

  // First visit: preselect the country from the visitor's address; the footer switch overrides it.
  // The code is saved as is: one the site does not offer reads as "other". Settings older versions
  // kept in localStorage move to their cookies first.
  useEffect(() => {
    migrateSettings();
    if (countryChosen()) return;
    whereAmI()
      .then((country) => setCountry(country ?? "KZ"))
      .catch(() => undefined);
  }, []);

  return (
    <LocaleContext value={locale}>
      <QueryClientProvider client={client}>
        <DocumentLanguage />
        <CountryListSync />
        {children}
      </QueryClientProvider>
    </LocaleContext>
  );
}

/** Keeps <html lang> on the language shown: the site's root layout sets it, the admin switches it here. */
function DocumentLanguage() {
  // The page's language on the site; outside it (the admin) the admin's own store.
  const { locale } = useI18n();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

/** Hands the owner's list of countries (GET /reference) to the language and country settings. */
function CountryListSync() {
  const countries = useReference().data?.countries;
  useEffect(() => {
    if (countries) setCountryList(countries);
  }, [countries]);
  return null;
}
