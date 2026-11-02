import { DEFAULT_LANGUAGE, localePath, type Language } from "@fabulka/shared";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { UI_LOCALES, type UiLocale } from "@/i18n/messages";
import { SITE_URL, languageVersions } from "@/lib/seo";
import { publicPages, seoPages, seoSettings } from "@/lib/seo-data";

/** The site's public pages that are always there, by their SEO key. */
const PAGES: { key: string; path: string }[] = [
  { key: "home", path: "/" },
  { key: "catalog", path: "/catalog" },
  { key: "create", path: "/create" },
  { key: "privacy", path: "/privacy" },
  { key: "terms", path: "/terms" },
];

/**
 * Every public page in every language, each with its hreflang alternates (the five languages and
 * x-default): the fixed pages and the published catalog books. An example book is a page in its own
 * language only, its alternates the same story's other language versions (unless the SEO settings
 * leave examples out). A language version staff set to noindex is left out. Built on request, so a
 * book added in the admin is listed without a rebuild.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [{ templates, examples }, settings, ...seo] = await Promise.all([publicPages(), seoSettings(), ...UI_LOCALES.map((l) => seoPages(l))]);
  const noindex = (key: string, locale: UiLocale) => seo[UI_LOCALES.indexOf(locale)][key]?.noindex === true;
  const absolute = (path: string) => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);
  const pages: { key: string; path: string; lastModified?: string }[] = [
    ...PAGES,
    ...templates.map((t) => ({ key: `template:${t.slug}`, path: `/catalog/${t.slug}`, lastModified: t.updatedAt })),
  ];
  const everywhere = pages.flatMap(({ key, path, lastModified }) => {
    const languages = Object.fromEntries(Object.entries(languageVersions(path)).map(([lang, href]) => [lang, absolute(href)]));
    return UI_LOCALES.flatMap((locale) =>
      noindex(key, locale)
        ? []
        : [
            {
              url: absolute(localePath(locale, path)),
              ...(lastModified ? { lastModified } : {}),
              alternates: { languages },
            },
          ],
    );
  });
  const books = settings.sitemapExamples
    ? examples.flatMap((book) => {
        const own = book.language ?? DEFAULT_LANGUAGE;
        if (noindex(`book:${book.id}`, own)) return [];
        const versions = book.versions ?? { [own]: book.id };
        const languages = Object.fromEntries(
          Object.entries(versions).map(([lang, id]) => [lang, absolute(localePath(lang as Language, `/books/${id}`))]),
        );
        return [{ url: absolute(localePath(own, `/books/${book.id}`)), lastModified: book.updatedAt, alternates: { languages } }];
      })
    : [];
  return [...everywhere, ...books];
}
