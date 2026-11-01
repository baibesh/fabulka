"use client";

import { OTHER_COUNTRY } from "@fabulka/shared";
import { useI18n } from "@/i18n/i18n";
import { regionName } from "@/lib/regions";

/**
 * Country names in the interface language (the admin's with `"admin"`): "other" is «Другая страна»,
 * and a code the browser cannot name falls back to `fallback`, else the code.
 */
export function useCountryName(scope: "site" | "admin" = "site") {
  const { t, locale } = useI18n(scope);
  return (code: string, fallback?: string) =>
    code === OTHER_COUNTRY ? t(scope === "admin" ? "admin.reference.other.title" : "country.other") : regionName(code, locale, fallback);
}
