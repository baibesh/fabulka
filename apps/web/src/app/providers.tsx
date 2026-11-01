"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { countryChosen, setCountry, setCountryList, setLocale, useI18n } from "@/i18n/i18n";
import { UI_LOCALES, type UiLocale } from "@/i18n/messages";
import { whereAmI } from "@/lib/api";
import { installErrorReporting } from "@/lib/telemetry";
import { useReference } from "@/lib/use-price";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const { locale } = useI18n();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Errors visitors run into go to the admin's journal (message and page only, no form values).
  useEffect(() => installErrorReporting(), []);

  // A link can choose the language: ?lang=kk, ?lang=en (and it sticks, like the header switch).
  useEffect(() => {
    const lang = new URLSearchParams(window.location.search).get("lang");
    if (lang && (UI_LOCALES as readonly string[]).includes(lang)) setLocale(lang as UiLocale);
  }, []);

  // First visit: preselect the country from the visitor's address; the footer switch overrides it.
  // The code is saved as is: one the site does not offer reads as "other".
  useEffect(() => {
    if (countryChosen()) return;
    whereAmI()
      .then((country) => setCountry(country ?? "KZ"))
      .catch(() => undefined);
  }, []);

  return (
    <QueryClientProvider client={client}>
      <CountryListSync />
      {children}
    </QueryClientProvider>
  );
}

/** Hands the owner's list of countries (GET /reference) to the language and country settings. */
function CountryListSync() {
  const countries = useReference().data?.countries;
  useEffect(() => {
    if (countries) setCountryList(countries);
  }, [countries]);
  return null;
}
