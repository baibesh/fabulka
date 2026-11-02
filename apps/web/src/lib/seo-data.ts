import {
  DEFAULT_SEO_SETTINGS,
  PublicSeoPagesSchema,
  SeoSettingsSchema,
  SitemapEntriesSchema,
  TemplateSchema,
  type PublicSeoPages,
  type SeoSettings,
  type SitemapEntries,
  type Template,
} from "@fabulka/shared";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import type { UiLocale } from "@/i18n/messages";
import { resolveSeo, seoMetadata, siteLocale, type SeoSubject } from "./seo-meta";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * The tags the API expires after an SEO change (POST /internal/revalidate): `seo` on a publish or a
 * settings save. Mirrors SEO_TAG in apps/api/src/seo/seo-web.service.ts.
 */
export const SEO_TAG = "seo";

/** GET from the API for cached data: no visitor, no headers; undefined when it cannot be reached. */
async function apiGet<T>(path: string, schema: { parse(value: unknown): T }): Promise<T | undefined> {
  try {
    const response = await fetch(`${API_URL}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) return undefined;
    return schema.parse(await response.json());
  } catch {
    return undefined;
  }
}

/**
 * The published SEO of every page in a language. Cached until a publish expires the `seo` tag; when
 * the API cannot be reached (a build without it) the defaults are kept for a minute only.
 */
export async function seoPages(locale: UiLocale): Promise<PublicSeoPages> {
  "use cache";
  cacheTag(SEO_TAG);
  const pages = await apiGet(`/api/seo/pages?lang=${locale}`, PublicSeoPagesSchema);
  if (!pages) {
    cacheLife("minutes");
    return {};
  }
  cacheLife("days");
  return pages;
}

/** Verification codes, analytics ids, extra robots.txt lines and the sitemap switch. */
export async function seoSettings(): Promise<SeoSettings> {
  "use cache";
  cacheTag(SEO_TAG);
  const settings = await apiGet("/api/seo/settings", SeoSettingsSchema);
  if (!settings) {
    cacheLife("minutes");
    return DEFAULT_SEO_SETTINGS;
  }
  cacheLife("days");
  return settings;
}

/** A catalog book in a language, for its page's title, description, cover and structured data. */
export async function templateForSeo(slug: string, locale: UiLocale): Promise<Template | null> {
  "use cache";
  cacheTag(SEO_TAG, `template:${slug}`);
  const template = await apiGet(`/api/templates/${encodeURIComponent(slug)}?lang=${locale}`, TemplateSchema);
  if (!template) {
    cacheLife("minutes");
    return null;
  }
  cacheLife("hours");
  return template;
}

/**
 * The tag the API expires after a change in the admin's «Examples» (EXAMPLES_TAG in
 * apps/api/src/seo/seo-web.service.ts): the example books below. The home page's examples are read
 * on each request and need no expiry.
 */
export const EXAMPLES_TAG = "examples";

/**
 * What the sitemap lists besides the fixed pages; example books (each version in its own language)
 * are also the public book pages.
 */
export async function publicPages(): Promise<SitemapEntries> {
  "use cache";
  cacheTag(SEO_TAG, "sitemap", EXAMPLES_TAG);
  const entries = await apiGet("/api/sitemap", SitemapEntriesSchema);
  cacheLife("minutes");
  return entries ?? { templates: [], examples: [] };
}

/** A page's metadata in a language: its published SEO over its defaults (lib/seo-meta.ts). */
export async function pageMetadata(asked: string, key: string, subject: Omit<SeoSubject, "key"> = {}): Promise<Metadata> {
  const locale = siteLocale(asked);
  const pages = await seoPages(locale);
  return seoMetadata(locale, key, resolveSeo(locale, { key, ...subject }, pages[key]));
}
