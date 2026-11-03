"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NewVersionBanner } from "@/components/layout/new-version";
import { LocaleContext, isLocale, migrateSettings, setCountryList, setLocale, useI18n } from "@/i18n/i18n";
import type { UiLocale } from "@/i18n/messages";
import { humanizeError } from "@/lib/outdated";
import { installErrorReporting } from "@/lib/telemetry";
import { useReference } from "@/lib/use-price";

/** `locale` is the site page's language (from its address; the global 404 passes the default one); the admin passes none. */
export function Providers({ locale = null, children }: { locale?: UiLocale | null; children: React.ReactNode }) {
  // A response that fails its schema check (a page older than the API) never shows its zod issues:
  // the error's message becomes "this page is out of date, reload it" in the page's language.
  const [client] = useState(
    () => new QueryClient({ queryCache: new QueryCache({ onError: humanizeError }), mutationCache: new MutationCache({ onError: humanizeError }) }),
  );

  // Errors visitors run into go to the admin's journal (message and page only, no form values).
  useEffect(() => installErrorReporting(), []);

  // The admin's language can come with a link (/admin?lang=en) and sticks, like its switch. The
  // site's ?lang= links never get here: the proxy redirects them to the language's address.
  useEffect(() => {
    if (locale) return;
    const lang = new URLSearchParams(window.location.search).get("lang");
    if (isLocale(lang)) setLocale(lang);
  }, [locale]);

  // Settings older versions kept in localStorage move to their cookies (the site's pages also do it
  // before saving the country the server detected, see CountryScope).
  useEffect(() => migrateSettings(), []);

  return (
    <LocaleContext value={locale}>
      <QueryClientProvider client={client}>
        <DocumentLanguage />
        <CountryListSync />
        {children}
        <NewVersionBanner />
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
