import { DEFAULT_LANGUAGE, localePath } from "@fabulka/shared";
import type { Metadata } from "next";
import { UI_LOCALES, type UiLocale } from "../i18n/messages";

/** The site's address: absolute URLs in metadata, the sitemap and robots.txt. */
export const SITE_URL = (process.env.SITE_URL ?? "https://fabulka.com").replace(/\/+$/, "");

const description =
  "Персональная детская книга, где ваш ребёнок — главный герой: сказка по детской методике и иллюстрации — на казахском, русском, английском, испанском или немецком. Powered by Meta Muse models.";

/** What every page starts from (each root layout exports it). */
export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Fabulka — книга, где ваш ребёнок главный герой", template: "%s · Fabulka" },
  description,
  openGraph: {
    type: "website",
    siteName: "Fabulka",
    title: "Fabulka — книга, где ваш ребёнок главный герой",
    description,
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

/**
 * The language versions of a site path, by hreflang: each language's address, and x-default for the
 * unprefixed Russian one.
 */
export function languageVersions(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(UI_LOCALES.map((language) => [language, localePath(language, path)])),
    "x-default": localePath(DEFAULT_LANGUAGE, path),
  };
}

/**
 * A page's canonical address (its own language version) and hreflang links to all five plus
 * x-default; relative, metadataBase makes them absolute.
 */
export function alternates(locale: UiLocale, path: string): Metadata["alternates"] {
  return { canonical: localePath(locale, path), languages: languageVersions(path) };
}
