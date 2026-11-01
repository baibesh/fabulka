import type { Language } from "@fabulka/shared";
import { intlLocale } from "@/i18n/format";
import type { UiLocale } from "@/i18n/messages";
import { KK_REGION_NAMES } from "./region-names-kk";

const namers = new Map<UiLocale, Intl.DisplayNames | null>();

function namer(locale: UiLocale): Intl.DisplayNames | null {
  if (!namers.has(locale)) {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([intlLocale(locale), "en"], { type: "region" });
    } catch {
      // A browser without region names shows the code.
    }
    namers.set(locale, names);
  }
  return namers.get(locale) ?? null;
}

/** Official names where the browser's Russian name is an old one («Киргизия»). */
const RU_REGION_NAMES: Record<string, string> = { KG: "Кыргызстан" };

/**
 * A country's name in this language ("KZ" → «Казахстан»), else `fallback`, else the code. Kazakh
 * names come from our own table: browsers have none and would answer in English.
 */
export function regionName(code: string, locale: UiLocale, fallback?: string): string {
  if (locale === "kk" && KK_REGION_NAMES[code]) return KK_REGION_NAMES[code];
  if (locale === "ru" && RU_REGION_NAMES[code]) return RU_REGION_NAMES[code];
  let name: string | undefined;
  try {
    name = namer(locale)?.of(code);
  } catch {
    name = undefined;
  }
  return name && name !== code ? name : (fallback ?? code);
}

/** The flag shown for each language: Kazakhstan's for Kazakh, Russia's for Russian, Britain's for English, Spain's for Spanish, Germany's for German. */
export const LANGUAGE_FLAGS: Record<Language, string> = { kk: "KZ", ru: "RU", en: "GB", es: "ES", de: "DE" };

/** The short label of a language next to its flag. */
export const languageCode = (language: Language) => (language === "kk" ? "ҚАЗ" : language.toUpperCase());
