"use client";

import { countryFromIp, type CountryEntry } from "@fabulka/shared";
import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CountryContext, adoptCountryList } from "@/i18n/i18n";
import { ServerQueries } from "@/lib/query";

/**
 * The client half of CountryData: what the server rendered this part with (the country from the
 * cookie, the owner's countries, the data it fetched), so hydration starts from the same state and
 * the first render already shows the visitor's prices, catalog and FAQ.
 */
export function CountryScope({
  saved,
  countries,
  state,
  children,
}: {
  /** The country cookie as the server read it; null when there is none yet. */
  saved: string | null;
  countries: readonly CountryEntry[];
  state: DehydratedState;
  children: React.ReactNode;
}) {
  // Taken over once, before the children render, so the client's first look at the list matches the
  // server's (a newer list from GET /reference replaces it later).
  useState(() => adoptCountryList(countries));
  const value = useMemo(() => ({ country: countryFromIp(saved, countries), countries }), [saved, countries]);
  const hashes = useMemo(() => new Set(state.queries.map((q) => q.queryHash)), [state]);
  return (
    <CountryContext value={value}>
      <ServerQueries value={hashes}>
        <HydrationBoundary state={state}>{children}</HydrationBoundary>
      </ServerQueries>
    </CountryContext>
  );
}
