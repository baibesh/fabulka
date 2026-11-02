import { localePath, seoPageKind, seoPagePath, type PublishedSeo, type SeoStaticPage } from "@fabulka/shared";
import type { Metadata } from "next";
import { format } from "../i18n/format";
import { MESSAGES, type MessageKey, type UiLocale } from "../i18n/messages";
import { alternates } from "./seo";

/**
 * A page's title, description, OG image and noindex: what staff published in the admin's «SEO» for
 * the page's language, else the page's default (texts in the i18n messages, a catalog book's own
 * title, summary and cover, an example book's title and cover), else the site's. Pure, so the
 * admin's previews use the very same rules as the site.
 */

/** The image social networks show when a page has none of its own: 1200×630 in public/. */
export const DEFAULT_OG_IMAGE = "/og.jpg";

/** Open Graph's locale for each interface language. */
export const OG_LOCALES: Record<UiLocale, string> = { ru: "ru_RU", kk: "kk_KZ", en: "en_US", es: "es_ES", de: "de_DE" };

/** What a page's defaults are built from besides its key. */
export interface SeoSubject {
  key: string;
  /** The catalog book's title in this language, or the example book's title. */
  label?: string | null;
  /** The catalog book's summary in this language. */
  summary?: string | null;
  /** The catalog book's or example book's cover. */
  coverUrl?: string | null;
}

export type SeoSource = "custom" | "default" | "fallback";

export interface ResolvedSeo {
  title: string;
  description: string;
  /** A site-relative or absolute URL. */
  image: string;
  noindex: boolean;
  /** Where each value came from: the admin's, the page's default, or the site's. */
  source: { title: SeoSource; description: SeoSource; image: "custom" | "cover" | "default" };
}

/**
 * One of the five languages: a page's [locale] can be anything for a moment (a missing file such as
 * /apple-touch-icon.png reaches the route before the layout answers 404), and metadata runs first.
 */
export const siteLocale = (locale: string): UiLocale => (locale in MESSAGES ? (locale as UiLocale) : "ru");

const message = (locale: UiLocale, key: MessageKey, vars?: Record<string, string>) => {
  const language = siteLocale(locale);
  return format(MESSAGES[language][key], vars, language);
};

/** The site's own title and description, when a page has nothing better. */
export function fallbackSeo(locale: UiLocale): { title: string; description: string } {
  return { title: message(locale, "seo.site.title"), description: message(locale, "seo.site.description") };
}

/** A page's default texts and image in a language (null where it has none of its own). */
export function defaultSeo(locale: UiLocale, subject: SeoSubject): { title: string | null; description: string | null; image: string | null } {
  const kind = seoPageKind(subject.key);
  const label = subject.label?.trim();
  if (kind === "template") {
    return {
      title: label ? message(locale, "seo.template.title", { title: label }) : null,
      description: subject.summary?.trim() || (label ? message(locale, "seo.template.description", { title: label }) : null),
      image: subject.coverUrl ?? null,
    };
  }
  if (kind === "book") {
    return {
      title: label ? message(locale, "seo.book.title", { title: label }) : null,
      description: label ? message(locale, "seo.book.description", { title: label }) : null,
      image: subject.coverUrl ?? null,
    };
  }
  const page = subject.key as SeoStaticPage;
  return {
    title: message(locale, `seo.${page}.title` as MessageKey),
    description: message(locale, `seo.${page}.description` as MessageKey),
    image: null,
  };
}

/** Custom (published), then the page's default, then the site's. */
export function resolveSeo(locale: UiLocale, subject: SeoSubject, custom: PublishedSeo | null | undefined): ResolvedSeo {
  const defaults = defaultSeo(locale, subject);
  const fallback = fallbackSeo(locale);
  const pick = (own: string | null | undefined, byDefault: string | null, site: string): [string, SeoSource] =>
    own?.trim() ? [own.trim(), "custom"] : byDefault ? [byDefault, "default"] : [site, "fallback"];
  const [title, titleSource] = pick(custom?.title, defaults.title, fallback.title);
  const [description, descriptionSource] = pick(custom?.description, defaults.description, fallback.description);
  const image = custom?.ogImageUrl ? custom.ogImageUrl : (defaults.image ?? DEFAULT_OG_IMAGE);
  const imageSource = custom?.ogImageUrl ? "custom" : defaults.image ? "cover" : "default";
  return {
    title,
    description,
    image,
    noindex: custom?.noindex ?? false,
    source: { title: titleSource, description: descriptionSource, image: imageSource },
  };
}

/**
 * The page's metadata: the title as is (no template, so the admin's preview is what Google gets),
 * description, canonical and hreflang, Open Graph and Twitter cards with the image, noindex.
 */
export function seoMetadata(locale: UiLocale, key: string, resolved: ResolvedSeo): Metadata {
  locale = siteLocale(locale);
  const path = seoPagePath(key);
  const own = resolved.source.image !== "default";
  const images = [{ url: resolved.image, ...(own ? {} : { width: 1200, height: 630 }), alt: resolved.title }];
  return {
    title: { absolute: resolved.title },
    description: resolved.description,
    alternates: alternates(locale, path),
    openGraph: {
      type: "website",
      siteName: "Fabulka",
      locale: OG_LOCALES[locale],
      url: localePath(locale, path),
      title: resolved.title,
      description: resolved.description,
      images,
    },
    twitter: { card: "summary_large_image", title: resolved.title, description: resolved.description, images: [resolved.image] },
    ...(resolved.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Length checks the admin shows next to the counters. */
export type SeoWarning = "title.long" | "title.short" | "description.long" | "description.short";
