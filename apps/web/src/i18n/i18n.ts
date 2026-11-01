"use client";

import { DEFAULT_COUNTRIES, countryFromIp, countryInfo, languageFor, type Country, type CountryEntry } from "@fabulka/shared";
import { useSyncExternalStore } from "react";
import { format, type Vars } from "./format";
import { MESSAGES, UI_LOCALES, type MessageKey, type UiLocale } from "./messages";

const LOCALE_KEY = "fabulka.locale";
const COUNTRY_KEY = "fabulka.country";
const CHANGE = "fabulka:settings";

export type { Country };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const isLocale = (value: string | null): value is UiLocale =>
  value !== null && (UI_LOCALES as readonly string[]).includes(value);

/**
 * The countries the site offers (GET /reference, see CountryListSync); today's defaults until they
 * arrive.
 */
let countryList: readonly CountryEntry[] = DEFAULT_COUNTRIES;
const currentCountryList = () => countryList;
const defaultCountryList = () => DEFAULT_COUNTRIES as readonly CountryEntry[];

/** Puts the owner's list of countries in place; the saved country and language follow it. */
export function setCountryList(countries: readonly CountryEntry[]) {
  if (JSON.stringify(countries) === JSON.stringify(countryList)) return;
  countryList = countries;
  window.dispatchEvent(new Event(CHANGE));
}

/**
 * The saved country if the site offers it, else "other"; Kazakhstan (the home market) until one is
 * detected or chosen. The code is saved as it was, so a country the owner lists later comes back.
 */
function currentCountry(): Country {
  return countryFromIp(read(COUNTRY_KEY), countryList);
}

/**
 * ?lang= on this page, else the saved choice, else the first of the browser's preferred languages
 * that the visitor's country offers, else Russian; then narrowed to the country's languages.
 */
function currentLocale(): UiLocale {
  const asked = new URLSearchParams(window.location.search).get("lang");
  const saved = read(LOCALE_KEY);
  const country = currentCountry();
  const preferred = (navigator.languages?.length ? navigator.languages : [navigator.language]).map((l) => l.slice(0, 2));
  const browser = preferred.find((l) => isLocale(l) && languageFor(country, l, countryList) === l) ?? null;
  const wanted = [asked, saved, browser].find(isLocale) ?? "ru";
  return languageFor(country, wanted, countryList);
}

/**
 * The admin's language: ?lang= on this page, else the saved choice, else Russian. Not narrowed to the
 * country's languages and not taken from the browser, so the panel opens in Russian until switched.
 */
function adminLocale(): UiLocale {
  const asked = new URLSearchParams(window.location.search).get("lang");
  return [asked, read(LOCALE_KEY)].find(isLocale) ?? "ru";
}

export function setLocale(locale: UiLocale) {
  // A ?lang= in the address outranks the saved choice, so a choice made here drops it.
  const url = new URL(window.location.href);
  if (url.searchParams.has("lang")) {
    url.searchParams.delete("lang");
    window.history.replaceState(window.history.state, "", url);
  }
  write(LOCALE_KEY, locale);
  document.documentElement.lang = locale;
}

/**
 * Saves the country. The language on screen stays if the country offers it, else gives way to the
 * country's first language; it is saved either way, so the switch never brings back an older one.
 */
export function setCountry(country: Country) {
  const locale = languageFor(countryFromIp(country, countryList), currentLocale(), countryList);
  write(COUNTRY_KEY, country);
  if (read(LOCALE_KEY) !== locale) setLocale(locale);
}

/** Whether the visitor has picked a country yet (otherwise it is detected once). */
export const countryChosen = () => read(COUNTRY_KEY) !== null;

/**
 * Interface language and country: `country` is a listed ISO code or "other", `info` what the site
 * offers there (languages, currency, print), `countries` the whole list. Pages render in Russian on
 * the server, then switch. The admin (`"admin"`) shares the saved language with the site but
 * chooses it by its own rules.
 */
export function useI18n(scope: "site" | "admin" = "site") {
  const locale = useSyncExternalStore(subscribe, scope === "admin" ? adminLocale : currentLocale, () => "ru" as UiLocale);
  const country = useSyncExternalStore(subscribe, currentCountry, () => "KZ" as Country);
  const countries = useSyncExternalStore(subscribe, currentCountryList, defaultCountryList);
  const t = (key: MessageKey, vars?: Vars) => format(MESSAGES[locale][key], vars, locale);
  return { locale, country, countries, info: countryInfo(country, countries), t };
}
