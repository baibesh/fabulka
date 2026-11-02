import { DEFAULT_COUNTRIES, GeoSchema, ReferenceSchema, countryFromIp, type Country, type CountryEntry, type Reference } from "@fabulka/shared";
import { cookies } from "next/headers";
import { COUNTRY_COOKIE } from "@/i18n/cookies";
import { serverGet } from "./server-api";

export interface VisitorCountry {
  /** The country the page is rendered for: a listed ISO code or "other". */
  country: Country;
  /** The country cookie as read; null on a first visit. */
  saved: string | null;
  /**
   * With no cookie, what the visitor's IP gave (the API's GET /geo, the address forwarded as
   * X-Real-IP): a listed code, or "other" for a country the site does not list and for an address
   * the database does not know. Null when there is a cookie, or when the API did not answer (the
   * browser then asks it itself).
   */
  detected: Country | null;
  countries: readonly CountryEntry[];
  /** The owner's reference data, when the API answered. */
  reference: Reference | undefined;
}

/**
 * The visitor's country for the server render: the cookie (picked or detected before), else the
 * country of the visitor's IP, else "other" (dollar prices, no print). Nobody is assumed to be in
 * Kazakhstan, so a crawler on an English page sees what the rest of the world sees. Reads the
 * cookie and the request headers, so it makes the part that calls it dynamic: call it inside a
 * <Suspense>. The API is asked once per request (serverGet is cached).
 */
export async function visitorCountry(): Promise<VisitorCountry> {
  const saved = (await cookies()).get(COUNTRY_COOKIE)?.value ?? null;
  const reference = await serverGet("/api/reference", ReferenceSchema);
  const countries = reference?.countries ?? DEFAULT_COUNTRIES;
  if (saved !== null) return { country: countryFromIp(saved, countries), saved, detected: null, countries, reference };
  const geo = await serverGet("/api/geo", GeoSchema);
  const detected = geo ? countryFromIp(geo.country, countries) : null;
  return { country: detected ?? countryFromIp(null, countries), saved, detected, countries, reference };
}
