"use client";

import { OTHER_COUNTRY, type Country, type CountryEntry } from "@fabulka/shared";
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CountryContext, adoptCountryList, adoptUnsavedCountry, countryChosen, migrateSettings, setCountry } from "@/i18n/i18n";
import { whereAmI } from "@/lib/api";
import { ServerQueries } from "@/lib/query";

/** The browser's own lookup of the visitor's country, asked at most once per page load. */
let lookup: Promise<void> | null = null;

/**
 * First visit: saves the country the server found by the visitor's IP in the cookie, so later
 * renders and the API (x-country) use it; the footer switch overrides it. Only when the server
 * could not ask the API does the browser ask (GET /geo) itself; an unknown address is "other".
 * Settings older versions kept in localStorage move to their cookies first.
 */
function settleCountry(detected: Country | null) {
  migrateSettings();
  if (countryChosen()) return;
  if (detected) return setCountry(detected);
  lookup ??= whereAmI()
    .then((country) => {
      if (!countryChosen()) setCountry(country ?? OTHER_COUNTRY);
    })
    .catch(() => undefined);
}

/**
 * The client half of CountryData: what the server rendered this part with (the country from the
 * cookie or the IP, the owner's countries, the data it fetched), so hydration starts from the same
 * state and the first render already shows the visitor's prices, catalog and FAQ.
 */
export function CountryScope({
  country,
  saved,
  detected,
  countries,
  state,
  children,
}: {
  /** The country the server rendered for. */
  country: Country;
  /** The country cookie as the server read it; null when there is none yet. */
  saved: string | null;
  /** With no cookie: the country of the visitor's IP as the server found it; null if it could not ask. */
  detected: Country | null;
  countries: readonly CountryEntry[];
  state: DehydratedState;
  children: React.ReactNode;
}) {
  // Taken over once, before the children render, so the client's first look at the list (and, with
  // no cookie yet, at the country) matches the server's (a newer list from GET /reference replaces
  // it later).
  useState(() => {
    adoptCountryList(countries);
    if (saved === null) adoptUnsavedCountry(country);
  });
  useEffect(() => settleCountry(detected), [detected]);
  const value = useMemo(() => ({ country, countries }), [country, countries]);
  const hashes = useMemo(() => new Set(state.queries.map((q) => q.queryHash)), [state]);
  return (
    <CountryContext value={value}>
      <ServerQueries value={hashes}>
        <HydrationBoundary state={state}>{children}</HydrationBoundary>
      </ServerQueries>
    </CountryContext>
  );
}
