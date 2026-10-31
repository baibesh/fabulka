"use client";

import { COUNTRIES, languageFor, type Country } from "@fabulka/shared";
import { useSyncExternalStore } from "react";
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

/** The saved country; Kazakhstan until one is detected or chosen. */
function currentCountry(): Country {
  const saved = read(COUNTRY_KEY);
  return (COUNTRIES as readonly (string | null)[]).includes(saved) ? (saved as Country) : "KZ";
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
  const browser = preferred.find((l) => isLocale(l) && languageFor(country, l) === l) ?? null;
  const wanted = [asked, saved, browser].find(isLocale) ?? "ru";
  return languageFor(country, wanted);
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
  const locale = languageFor(country, currentLocale());
  write(COUNTRY_KEY, country);
  if (read(LOCALE_KEY) !== locale) setLocale(locale);
}

/** Whether the visitor has picked a country yet (otherwise it is detected once). */
export const countryChosen = () => read(COUNTRY_KEY) !== null;

function format(text: string, vars?: Record<string, string | number>) {
  return vars ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : text;
}

/** Interface language and country. Pages render in Russian on the server, then switch. */
export function useI18n() {
  const locale = useSyncExternalStore(subscribe, currentLocale, () => "ru" as UiLocale);
  const country = useSyncExternalStore(subscribe, currentCountry, () => "KZ" as Country);
  const t = (key: MessageKey, vars?: Record<string, string | number>) => format(MESSAGES[locale][key], vars);
  return { locale, country, t };
}
