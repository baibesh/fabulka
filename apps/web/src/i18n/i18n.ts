"use client";

import { DEFAULT_COUNTRIES, OTHER_COUNTRY, countryFromIp, countryInfo, type Country, type CountryEntry } from "@fabulka/shared";
import { createContext, useContext, useSyncExternalStore } from "react";
import { COOKIE_MAX_AGE, COUNTRY_COOKIE, LOCALE_COOKIE } from "./cookies";
import { format, type Vars } from "./format";
import { MESSAGES, UI_LOCALES, type MessageKey, type UiLocale } from "./messages";

/** The admin's own language store (the site takes its language from the address). */
const ADMIN_LOCALE_KEY = "fabulka.locale";
/** Where the country used to be kept, before the cookie; moved over once (migrateSettings). */
const LEGACY_COUNTRY_KEY = "fabulka.country";
const CHANGE = "fabulka:settings";

export type { Country };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const changed = () => window.dispatchEvent(new Event(CHANGE));

export const isLocale = (value: string | null | undefined): value is UiLocale =>
  typeof value === "string" && (UI_LOCALES as readonly string[]).includes(value);

/**
 * The language of the page: the address's (`/en/…`), handed down by the [locale] layout. Null
 * outside the site (the admin, the global 404).
 */
export const LocaleContext = createContext<UiLocale | null>(null);

/**
 * What the server knew when it rendered this part (CountryScope): the visitor's country from the
 * cookie and the owner's list of countries. Hydration starts from it, so prices and lists match.
 */
export const CountryContext = createContext<{ country: Country; countries: readonly CountryEntry[] } | null>(null);

/**
 * The countries the site offers (GET /reference, see CountryListSync); today's defaults until they
 * arrive.
 */
let countryList: readonly CountryEntry[] = DEFAULT_COUNTRIES;
const currentCountryList = () => countryList;

/** Puts the owner's list of countries in place; the saved country follows it. */
export function setCountryList(countries: readonly CountryEntry[]) {
  if (adoptCountryList(countries)) changed();
}

/**
 * The same, without telling subscribers: for a list the server rendered with, taken over while
 * hydrating so the first client render already uses it. True when the list changed.
 */
export function adoptCountryList(countries: readonly CountryEntry[]): boolean {
  if (typeof window === "undefined" || JSON.stringify(countries) === JSON.stringify(countryList)) return false;
  countryList = countries;
  return true;
}

/**
 * With no country cookie yet: the country the server rendered the page for (the visitor's IP, else
 * "other", see visitorCountry), so the browser's first renders agree with the HTML until the
 * cookie is written.
 */
let unsavedCountry: Country = OTHER_COUNTRY;

/** Takes over the country the server rendered with while there is no cookie (CountryScope). */
export function adoptUnsavedCountry(country: Country) {
  if (typeof window !== "undefined") unsavedCountry = country;
}

/**
 * The saved country if the site offers it, else "other"; before one is saved, the one the server
 * rendered with. The code is saved as it was, so a country the owner lists later comes back.
 */
function currentCountry(): Country {
  const saved = readCookie(COUNTRY_COOKIE);
  return saved === null ? unsavedCountry : countryFromIp(saved, countryList);
}

/**
 * The admin's language: ?lang= on this page, else the saved choice, else Russian. Not narrowed to the
 * country's languages and not taken from the browser, so the panel opens in Russian until switched.
 */
function adminLocale(): UiLocale {
  const asked = new URLSearchParams(window.location.search).get("lang");
  return [asked, read(ADMIN_LOCALE_KEY)].find(isLocale) ?? "ru";
}

/** The admin's language switch (the site switches language by going to the page's other address). */
export function setLocale(locale: UiLocale) {
  // A ?lang= in the address outranks the saved choice, so a choice made here drops it.
  const url = new URL(window.location.href);
  if (url.searchParams.has("lang")) {
    url.searchParams.delete("lang");
    window.history.replaceState(window.history.state, "", url);
  }
  try {
    localStorage.setItem(ADMIN_LOCALE_KEY, locale);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  changed();
  document.documentElement.lang = locale;
}

/** The language the visitor picked on the site last, as a preference (never a redirect). */
export const localePreference = (): UiLocale | null => {
  const saved = readCookie(LOCALE_COOKIE);
  return isLocale(saved) ? saved : null;
};

export function setLocalePreference(locale: UiLocale) {
  writeCookie(LOCALE_COOKIE, locale);
}

/**
 * Saves the country in its cookie, for the server's next render too; every part that depends on it
 * (prices, the catalog, the examples, the FAQ) follows at once. The page's language stays: the
 * country picker itself goes to another language when the country does not offer this one.
 */
export function setCountry(country: Country) {
  writeCookie(COUNTRY_COOKIE, country);
  changed();
}

/** The country saved on this browser (picked or detected), as saved; null before either. */
export const savedCountry = () => readCookie(COUNTRY_COOKIE);

/** Whether the visitor has a country saved yet (picked, or detected on the first visit). */
export const countryChosen = () => readCookie(COUNTRY_COOKIE) !== null;

/**
 * Moves what older versions kept in localStorage to the cookies, once: the country (now read by the
 * server) and the last language, which becomes the language preference.
 */
export function migrateSettings() {
  const country = read(LEGACY_COUNTRY_KEY);
  if (country !== null) {
    if (!countryChosen()) setCountry(country);
    try {
      localStorage.removeItem(LEGACY_COUNTRY_KEY);
    } catch {
      // Nothing to clean up.
    }
  }
  const locale = read(ADMIN_LOCALE_KEY);
  if (isLocale(locale) && readCookie(LOCALE_COOKIE) === null) setLocalePreference(locale);
}

const ru = () => "ru" as UiLocale;

/**
 * Interface language and country: `locale` is the page's language (from its address), `country` a
 * listed ISO code or "other", `info` what the site offers there (languages, currency, print),
 * `countries` the whole list. The country comes from its cookie; inside a CountryScope the server
 * rendered with the same one. The admin (`"admin"`) keeps its own language store.
 */
export function useI18n(scope: "site" | "admin" = "site") {
  const pageLocale = useContext(LocaleContext);
  const server = useContext(CountryContext);
  const stored = useSyncExternalStore(subscribe, adminLocale, ru);
  const locale = scope === "site" && pageLocale ? pageLocale : stored;
  const serverCountries = server?.countries ?? DEFAULT_COUNTRIES;
  const country = useSyncExternalStore(subscribe, currentCountry, () => server?.country ?? countryFromIp(null, serverCountries));
  const countries = useSyncExternalStore(subscribe, currentCountryList, () => serverCountries);
  const t = (key: MessageKey, vars?: Vars) => format(MESSAGES[locale][key], vars, locale);
  return { locale, country, countries, info: countryInfo(country, countries), t };
}
